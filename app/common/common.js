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

// 获取CPU数量
common.getCpuNum = function () {
  return os.cpus().length;
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
}

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

module.exports = common;