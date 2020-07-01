'use strict';

const _ = require('underscore');
const logger = require('./logger');
const netPacket = require('./netPacket');
const STSCmd = require('../config/STSCmd');
const dealCmd = require('./dealCmd');
const net  = require('net');
const config = require('config');
const common = require('./common');
const helloTimeout = (config.has('app.helloTimeout') && config.get('app.helloTimeout') >= 0) ? 
  config.get('app.helloTimeout') : 15 * 1000;

// 处理连接
function handleConnection(logParse, socket) {
  // 地址和端口有可能为空，具体请看
  // https://github.com/nodejs/node/issues/23858
  // https://github.com/nodejs/node-v0.x-archive/issues/7566
  // 复现方法
  // https://github.com/nodejs/node-v0.x-archive/issues/16523
  // 抓包发现client再握手完成后，直接发送了Rset报文造成，以下是抓包记录
  /*
    10:29:46.820255 c4:54:44:76:72:a6 > 00:e0:1a:68:01:6e, ethertype IPv4 (0x0800), length 66: (tos 0x0, ttl 64, id 60817, offset 0, flags [DF], proto TCP (6), length 52)
        192.168.6.113.38363 > 192.168.6.114.12345: Flags [S], cksum 0x9c9b (correct), seq 2343486683, win 11680, options [mss 1460,nop,nop,sackOK,nop,wscale 10], length 0
    10:29:46.820324 00:e0:1a:68:01:6e > c4:54:44:76:72:a6, ethertype IPv4 (0x0800), length 66: (tos 0x0, ttl 64, id 0, offset 0, flags [DF], proto TCP (6), length 52)
        192.168.6.114.12345 > 192.168.6.113.38363: Flags [S.], cksum 0xf227 (correct), seq 2703017176, ack 2343486684, win 29200, options [mss 1460,nop,nop,sackOK,nop,wscale 7], length 0
    10:29:46.820420 c4:54:44:76:72:a6 > 00:e0:1a:68:01:6e, ethertype IPv4 (0x0800), length 60: (tos 0x0, ttl 64, id 60818, offset 0, flags [DF], proto TCP (6), length 40)
        192.168.6.113.38363 > 192.168.6.114.12345: Flags [.], cksum 0xa4fe (correct), ack 1, win 12, length 0
    10:29:46.820463 c4:54:44:76:72:a6 > 00:e0:1a:68:01:6e, ethertype IPv4 (0x0800), length 60: (tos 0x0, ttl 64, id 60819, offset 0, flags [DF], proto TCP (6), length 40)
        192.168.6.113.38363 > 192.168.6.114.12345: Flags [R.], cksum 0xa4fa (correct), seq 1, ack 1, win 12, length 0
  */
  // 官方文档也进行说明
  // socket.remoteAddress - Value may be undefined if the socket is destroyed (for example, if the client disconnected).
  if (socket.remoteAddress === undefined || socket.destroyed === true) {
    logger.fatal('game socket is destroyed');
    socket.destroy();
    return;
  }
  let remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
  logger.info('game socket connection from %s', remoteAddress);
  // socket.setEncoding('utf8');
  let buf = null;

  // 数据
  socket.on('data', onConnData);
  // 关闭
  socket.once('close', onConnClose);
  // 错误
  socket.on('error', onConnError);
  // hello发送超时
  socket.helloTimeoutHandle = setTimeout(onHelloTimeout, helloTimeout, socket);

  // 处理数据
  function onConnData(chunk) {
    if (buf) {
      chunk = Buffer.concat([buf, chunk]);
      buf = null;
    }

    netPacket.unpackData(chunk, async function(dataCmd, jsonStr) {
      let d = null;
      try {
        d = JSON.parse(jsonStr);
      } catch (e) {
        d = {};
      }

      switch (dataCmd) {
        case STSCmd.eSTS_INNERBA_HELLO: {
          if (_.isUndefined(d.grpId)) {
            logger.error('[net exception]: eSTS_INNERBA_HELLO error, %s', jsonStr);
            return;
          }
          socket.grpId = d.grpId;
          logger.info('game socket say hello %s', jsonStr);
          dealCmd.setSocket(d.grpId, socket);
          // 没问题了，关闭timer
          clearTimeout(socket.helloTimeoutHandle);
          socket.helloTimeoutHandle = null;
          // 这里必须要回复消息的，客户端收到这个消息，说明该socket已经成功绑定到worker，
          // 从而可以开始逻辑交互了
          socket.write(netPacket.packData(dataCmd, { msg: 'ba server register ok' }));
          break;
        }
        case STSCmd.eSTS_INNERBA_DATA: {
          if (_.isUndefined(d.logId) || _.isUndefined(d.logMsg) || _.isUndefined(socket.grpId)) {
            logger.error('[net exception]: eSTS_INNERBA_DATA error, %s', jsonStr);
            return;
          }
          d.grpId = socket.grpId;
          d.logId = d.logId.toString();
          logger.info('get eSTS_INNERBA_DATA: %s', JSON.stringify(d));
          await dealCmd.dealRawLog(logParse, d).catch((e) => {
            logger.error('dealCmd.dealRawLog error: %s', e.stack);
          });
          break;
        }
        case STSCmd.eSTS_INNERBA_INNER: {
          if (_.isEmpty(d.head) || _.isUndefined(d.head.cmdId) || _.isUndefined(socket.grpId)) {
            logger.error('[net exception]: eSTS_INNERBA_INNER error,%s', jsonStr);
            return;
          }
          d.head.originGrpId = socket.grpId;
          logger.info('get eSTS_INNERBA_INNER: %s', JSON.stringify(d));
          try {
            await dealCmd.dealInnerMessage(d);
          } catch(e) {
            logger.error('dealCmd.dealInnerMessage error: %s', e.stack);
          }
          break;
        }
        default: {
          if (_.isEmpty(d.head) || _.isUndefined(d.head.reqId) || _.isUndefined(socket.grpId)) {
            logger.error('[net exception]: default cmd error,%s', jsonStr);
            return;
          }
          common.dealWaitInnerMessage(d.head.reqId, null, d);
          break;
        }
      }
    }, function(leftChunk) {
      buf = leftChunk;
    });
  }
  // 连接关系
  function onConnClose() {
    logger.info('game socket from %s close', remoteAddress);
    dealCmd.delSocket(socket.grpId);
    common.clearTimerAndKick(socket);
  }
  // 连接错误
  function onConnError(err) {
    logger.info('game socket connection %s error: %s', remoteAddress, err.message);
    dealCmd.delSocket(socket.grpId);
    common.clearTimerAndKick(socket);
  }
  // hello发送超时
  function onHelloTimeout(socket) {
    logger.info('game socket connection %s send hello timeout: %d and kick', remoteAddress, helloTimeout);
    common.clearTimerAndKick(socket, true);
  }
}

module.exports = {
	handleConnection: handleConnection
};