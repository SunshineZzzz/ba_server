'use strict';

const g = require('../global');
const _ = require('underscore');
const log4js = require('log4js');
const util = require('util');
const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');
const config = require('config');
const mysqlDb = require('./mysqlDb');

let common = {};
// 内部请求
let innerReqs = {}
// 内部请求自增ID
let InnerReqId = 0;
// 内部请求超时
let InnerWaitTime = config.has('app.waitTime') ? config.get('app.waitTime') : 5000;
// 原始日志分隔符
let logSeparator = config.has('app.logSeparator') ? config.get('app.logSeparator') : ',';

// null or undefined
common.isNullOrUndefined = function(object) {
  return (object === null || object === undefined);
};

// 获取CPU数量
common.getCpuNum = function () {
  return os.cpus().length;
};

// 休眠
common.sleep = (seconds) => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, (seconds * 1000));
  });
};

// 递归同步创建目录
common.mkdirsSync = function (dirname) {
  if (fs.existsSync(dirname)) {
    return true;
  } else {
    if (this.mkdirsSync(path.dirname(dirname))) { 
      fs.mkdirSync(dirname);
      return true;
    }
  }
};

// 同步删除文件
common.delFile = function (path) {
  if (fs.existsSync(path)) {
    fs.unlinkSync(path);
  }
};

// work进程退出
common.workExit = function (code) {
  log4js.shutdown(() => {
    process.exit(code);
  });
};

// 获取mysqldb对象
common.getDbConn = async function (dbName) {
  if (_.isEmpty(mysqlDb.pools[dbName])) {
    let k = 'mysql.' + dbName;
    let dbCfg = config.get(k);
    await mysqlDb.setConn(dbName, dbCfg);
  }

  return mysqlDb.getConn(dbName);
};

// 执行日志的SQL语句
common.logSql2Db = async function (sql, params) {
  if (this.isNullOrUndefined(sql) || this.isNullOrUndefined(params)) {
    return;
  }
  let db = await this.getDbConn('basvr');
  await db.execute(sql, params);
};

// 设置内部的请求
common.setInnerReq = function (reqObj) {
  let reqId = ++InnerReqId;
  reqObj.tHandle = setTimeout(() => {
    let err = new Error('Request Time-out');
    err.status = 408;
    clearTimeout(reqObj.tHandle);
    reqObj.tHandle = null;
    reqObj = null;
    this.delInnerReq(reqId);
    this.dealWaitInnerMessage(reqId, err);
  }, InnerWaitTime);
  innerReqs[reqId] = reqObj;

  return reqId;
};

// 获取内部请求
common.getInnerReq = function (reqId) {
  return innerReqs[reqId];
};

// 删除内部请求
common.delInnerReq = function (reqId) {
  delete innerReqs[reqId];
};

// 等待内部请求
common.waitForInnerResponse = async function(reqId) {
  return new Promise((resolve, reject) => {
    let reqObj = this.getInnerReq(reqId);
    if (_.isEmpty(reqObj)) {
      let err = new Error('have dealed reqId: %d', reqId);
      common.delInnerReq(reqId);
      reject(err);
      return;
    }

    let cb = function (curReqId, err, result) {
      if (curReqId !== reqId) {
        return;
      }
      clearTimeout(reqObj.tHandle);
      reqObj.tHandle = null;
      reqObj = null;
      common.delInnerReq(reqId);
      g.dispatcher.removeListener('waitMessage', cb);
      err ? reject(err) : resolve(result);      
    };

    g.dispatcher.on('waitMessage', cb);
  });
};

// 响应内部请求
common.dealWaitInnerMessage = function (reqId, err, data) {
  g.dispatcher.emit('waitMessage', reqId, err, data);
};

// 是否是有效的字符串
common.isValidStr = function (str) {
  return (_.isString(str) && str.trim().length > 0);
};

// 字符串是否可以转化成整数
common.strIsNumber = function (str, radix = 10) {
  return !isNaN(parseInt(str, radix));
};

// Map or Set 对象的序列化 
common.mapOrSetSerialize = function (mapObj, space = '  ') {
  if (!_.isMap(mapObj)) {
    return '';
  }
  // ...遍历generator
  return JSON.stringify([...mapObj.entries()], null, space);
};

// 将原始日志转换成数组
common.logMsg2Arr = function (d) {
  if (this.isNullOrUndefined(d) ||
      !this.isValidStr(d.logMsg) || 
      !_.isNumber(d.grpId)) {
    return [null, null, null, null, null];
  }
  let arrLogs = d.logMsg.split(logSeparator);
  arrLogs = arrLogs.map((elem) => {
    return elem.trim();
  });
  let processInfo = arrLogs.shift().trim();
  let processTime = arrLogs.shift().trim();
  let rawLogId = arrLogs.shift().trim();
  let rawLogName = arrLogs.shift().trim();
  arrLogs.unshift('pad');
  // 严禁写入下标，并赋值
  // 并不影响arr的长度
  arrLogs['autoSvrId'] = d.grpId;
  // Object.defineProperty(arrLogs, 'autoTime', { 
  //   get: function() {
  //     return parseInt(new Date().getTime()/1000);
  //   } 
  // });
  return [arrLogs, processInfo, processTime, rawLogId, rawLogName];
};

// NumberProp是否是整数或者允许的关键字
common.isAllowNumberProp = function (numberProp) {
  if (this.isNullOrUndefined(numberProp) || 
      (!this.strIsNumber(numberProp) && 
        numberProp !== 'autoSvrId' /*&& 
        numberProp !== 'autoTime'*/)) {
    return false;
  }
  return true;
};

// 清除socket上的timer并且kick
common.clearTimerAndKick = function (socket, bKick = false) {
  if (!(socket instanceof net.Socket)) {
    return;
  }
  if (!this.isNullOrUndefined(socket.helloTimeoutHandle)) {
    clearTimeout(socket.helloTimeoutHandle);
    socket.helloTimeoutHandle = null;
  }
  if (bKick === true) {
    socket.destroy();
  }
};

module.exports = common;