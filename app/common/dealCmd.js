'use strict';

const _ = require('underscore');
const logger = require('./logger');
const common = require('./common');
const innerCode = require('./errorCode').innerCode;
const STSCmd = require('../config/STSCmd');
const netPacket = require('./netPacket');

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

// 单个日志落库
function dealSingleLog(logObj, d) {
  let arrRst = [null, null];
  if (common.isNullOrUndefined(logObj) || 
      common.isNullOrUndefined(d)) {
    return arrRst;
  }
  let [arrLogs, processInfo, processTime, rawLogId, rawLogName] = common.logMsg2Arr(d);
  if (arrLogs === null) {
    return arrRst;
  }
  if ((arrLogs.length-1) < logObj.maxNumber) {
    return arrRst;
  }
  if (logObj.logName !== rawLogName || 
      logObj.logId !== rawLogId) {
    return arrRst;
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
  return [sql, params];
}

// 多个日志落库
function dealMultiLog(multiTableObj, d) {
  let arrRst = [null, null];
  if (common.isNullOrUndefined(multiTableObj) || 
      common.isNullOrUndefined(d)) {
    return arrRst;
  }
  let scriptStr = multiTableObj.script;
  let workFunc = require('../plugin/' + scriptStr);
  return workFunc(d)
}

// 处理原始日志
dealCmd.dealRawLog = async function(logParse, d) {
  if (common.isNullOrUndefined(logParse) || 
      common.isNullOrUndefined(d)) {
    return;
  }
  
  // 单个日志落库
  let singleLogObj = logParse.getSingleObj(d.logId);
  if (!_.isUndefined(singleLogObj) && 
      _.isMap(singleLogObj.field) && 
      singleLogObj.field.size > 0) {
    let [sql, params] = dealSingleLog(singleLogObj, d);
    await common.logSql2Db(sql, params);
  }
  // 多个日志落库
  let multiIdObj = logParse.getMultiIdObj(d.logId);
  if (_.isUndefined(multiIdObj)) {
    return;
  }
  // id === d.logId
  for (let [name, id] of multiIdObj) {
    let multiTableObj = logParse.getMultiTableObj(name);
    if (_.isUndefined(multiTableObj)) {
      continue;
    }
    if (!multiTableObj.ids.has(id)) {
      continue;
    }
    let [sql, params] = dealMultiLog(multiTableObj, d);
    await common.logSql2Db(sql, params);
  }
};

// 处理内部请求
dealCmd.sendInnerReq = async function(d) {
  if (_.isUndefined(d.head.grpId) || _.isNull(d.head.grpId)) {
    d.head.ret = innerCode.param;
    d.head.errMsg = 'Invalid head param grpId';
    d.body = {}
    return;
  }

  switch(d.head.cmdId) {
    default: {
      d.body = { msg: `${d.head.originGrpId} client say hello` };
      break;
    }
  }

  let sendSocket = this.getSocket(d.head.grpId);
  if (_.isUndefined(sendSocket) || _.isNull(sendSocket)) {
    d.head.ret = innerCode.net;
    d.head.errMsg = 'request socket is invalid';
    d.body = {};
    return;
  }
 
  let reqId = common.setInnerReq({});
  let sendData = {
    head: {
      cmdId: d.head.cmdId,
      reqId: reqId,
      ret: innerCode.ok,
      errMsg: ''
    },
    body: d.body
  };
  sendSocket.write(netPacket.packData(STSCmd.eSTS_IDIP_CMD, sendData));
  sendData = null;
  sendSocket = null;

  try {
    let retData = await common.waitForInnerResponse(reqId);
    d.head.ret = retData.head.ret;
    d.head.errMsg = retData.head.errMsg;
    d.body = retData.body;
    retData = null;
  } catch (e) {
    if (e.status === 408) {
      d.head.ret = innerCode.timeout;
    } else {
      d.head.ret = innerCode.api;
    }
    d.head.errMsg = e.message;
    d.body = {};
  }
};

// 回复内部请求
dealCmd.replyInnerReq = async function(d) {
  let originSocket = this.getSocket(d.head.originGrpId);
  if (_.isUndefined(originSocket)) {
    return;
  }

  delete d.head.originGrpId;
  d.head.reqId = 0;
  d.head.cmdId += 1;

  originSocket.write(netPacket.packData(STSCmd.eSTS_IDIP_CMD, d));
  logger.info("reply inner_msg: %s", JSON.stringify(d));
};

// 处理内部请求
dealCmd.dealInnerMessage = async function (d) {
  await dealCmd.sendInnerReq(d);
  await dealCmd.replyInnerReq(d);
};

module.exports = dealCmd;