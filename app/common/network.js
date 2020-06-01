'use strict';

const _ = require('underscore');
const logger = require('./logger');
const netPacket = require('./netPacket');
const STSCmd = require('../config/STSCmd');
const dealCmd = require('./dealCmd');
const net  = require('net');
const config = require('config');
const common = require('./common');

// 处理连接
function handleConnection(logParse, socket) {
  let remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
  logger.info('game socket connection from %s', remoteAddress);
  let buf = null;

  socket.on('data', onConnData);
  socket.once('close', onConnClose);
  socket.on('error', onConnError);

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
            socket.end();
            return;
          }
          socket.grpId = d.grpId;
          logger.info('game socket say hello %s', jsonStr);
          dealCmd.setSocket(d.grpId, socket);
          socket.write(netPacket.packData(dataCmd, { msg: 'ba server register ok' }));
          break;
        }
        case STSCmd.eSTS_INNERBA_DATA: {
          if (_.isUndefined(d.logId) || _.isUndefined(d.logMsg)) {
            logger.error('[net exception]: eSTS_INNERBA_DATA error, %s', jsonStr);
            return;
          }
          logger.info('get eSTS_INNERBA_DATA: %s', JSON.stringify(d));
          await dealCmd.dealRawLog(logParse, d.logId, d.logMsg).catch((e) => {
            logger.error('dealCmd.dealRawLog error: %s', e.stack);
          });
          break;
        }
        case STSCmd.eSTS_INNERBA_INNER: {
          if (_.isEmpty(d.head) || _.isUndefined(d.head.cmdId)) {
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
          if (_.isEmpty(d.head) || _.isNull(d.head.reqId)) {
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
  }
  // 连接错误
  function onConnError(err) {
    logger.info('game socket connection %s error: %s', remoteAddress, err.message);
    dealCmd.delSocket(socket.grpId);
  }
};

module.exports = {
	handleConnection: handleConnection
};