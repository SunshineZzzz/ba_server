'use strict';

const os = require('os');
const log4js = require('log4js');
const logger = require('./common/logger');
const exitCode = require('./common/errorCode').exitCode;

// 捕获没有关注的异常事件
process.on('uncaughtException', (err, origin) => {
  if (global.isMaster) {
    // 都是对于master而言
    let errMsg = err.toString();
    // linux 无视异常断开
    if (os.type() === 'Windows_NT') {
      // 对于windows而言，socket异常中断造成Master异常
      // 对于windows而言，taskkill造成Master异常，
      // 实在不想这样就用loggerMulti.js，有大佬PR了，咱就不手动改log4js源码了
      // https://github.com/log4js-node/log4js-node/issues/713
      if (errMsg === 'Error: read ECONNRESET') {
        logger.error(err);
        return;
      }
    }
  }

  logger.error(err);
  process.exit(exitCode.rtErr);
});