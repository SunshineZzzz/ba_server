'use strict';

const _ = require('underscore');
const logger = require('./logger');
const common = require('./common');

let dealCmd = {};
// sockets
let sockets = {};

// 记录连接的socket
dealCmd.setSocket = function (svrGrpId, socket) {
  if (_.isUndefined(svrGrpId)) {
    return;
  }
  if (_.isUndefined(sockets[svrGrpId])) {
    sockets[svrGrpId] = {};
  }
  sockets[svrGrpId] = socket;
};

// 获取socket
dealCmd.getSocket = function (svrGrpId) {
  if (_.isUndefined(svrGrpId)) {
    return undefined;
  }
  if (_.isUndefined(sockets[svrGrpId])) {
    return undefined;
  }
  return sockets[svrGrpId];
};

// 获取sockets
dealCmd.getSockets = function () {
  return sockets;
};

// 删除socket
dealCmd.delSocket = function (svrGrpId) {
  if (_.isUndefined(this.getSocket(svrGrpId))) {
    return;
  }
  delete sockets[svrGrpId];
};

// 处理原始日志
dealCmd.dealRawLog = async function(logParse, logId, logMsg) {
  if (!_.isMap(logParse) || !_.isNumber(logId) || !_.isString(logMsg)) {
    return;
  }

  let logObj = logParse.get(logId.toString());
  if (_.isUndefined(logObj) || !_.isMap(logObj.field) || logObj.field.size <= 0) {
    return;
  }

  let arrLogs = logMsg.split(',');
  if (arrLogs.length - 4 < logObj.maxNumber) {
    logger.error('arrLogs.length - 4 <= logObj.maxNumber,%d,%d,%s,%s', arrLogs.length, 
      logObj.maxNumber, logObj.logId, logObj.logName);
    return;
  }

  let processInfo = arrLogs.shift().trim();
  let processTime = arrLogs.shift().trim();
  let rawLogId = arrLogs.shift().trim();
  let rawLogName = arrLogs.shift().trim();
  arrLogs.unshift('pad');
  if (logObj.logName !== rawLogName || logObj.logId !== rawLogId) {
    logger.error('logObj.logName !== rawLogName || logObj.logId !== rawLogId,%s,%s,%s,%s', rawLogId, 
      rawLogName, logObj.logId, logObj.logName);
    return;
  }

  let i = 0;
  let params = [];
  let sizeField = logObj.field.size;
  let sql = 'INSERT INTO ' + logObj.logName + ' (';
  for (let [number, elem] of logObj.field) {
    i += 1;
    if (i == sizeField) {
      sql += elem.name;
    } else {
      sql += elem.name + ', ';
    }
  }
  i = 0;
  sql += ') VALUES (';
  for (let [number, elem] of logObj.field) {
    i += 1;
    if (i == sizeField) {
      sql += '?';
    } else {
      sql += '?, ';
    }
    params.push(arrLogs[number]);
  }
  sql += ');';

  let db = await common.getDbConn('basvr').catch((e) => {
    logger.error('common.getDbConn err,%s,%s,%s', rawLogId, rawLogName, e.toString());
  });
  return await db.execute(sql, params).catch((e)=>{
    logger.error('sql execute err,%s,%s,%s', rawLogId, rawLogName, e.toString());
  });
}

module.exports = dealCmd;