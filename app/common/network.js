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
  // 官方文档也进行说明
  // socket.remoteAddress - Value may be undefined if the socket is destroyed (for example, if the client disconnected).
  if (socket.remoteAddress === undefined || socket.destroyed === true) {
    logger.fatal('game socket is destroyed from %s', socket.remoteAddressAndPort);
    socket.destroy();
    return;
  }

  logger.info('game socket connection from %s', socket.remoteAddressAndPort);
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
  // 一切就绪，恢复'data'事件
  socket.resume();

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
    logger.info('game socket from %s close', socket.remoteAddressAndPort);
    dealCmd.delSocket(socket.grpId);
    common.clearTimerAndKick(socket);
  }
  // 连接错误
  function onConnError(err) {
    logger.info('game socket connection %s error: %s', socket.remoteAddressAndPort, err.message);
    dealCmd.delSocket(socket.grpId);
    common.clearTimerAndKick(socket);
  }
  // hello发送超时
  function onHelloTimeout(socket) {
    logger.info('game socket connection %s send hello timeout: %d and kick', socket.remoteAddressAndPort, helloTimeout);
    common.clearTimerAndKick(socket, true);
  }
}

module.exports = {
	handleConnection: handleConnection
};