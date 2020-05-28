'use strict';

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

// 获取CPU数量
common.getCpuNum = function () {
  return os.cpus().length;
};

// 递归同步创建目录
common.mkdirsSync = function (dirname) {
  if (fs.existsSync(dirname)) {
    return true;
  } else {
    if (common.mkdirsSync(path.dirname(dirname))) { 
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
}

// 获取mysqldb对象
common.getDbConn = async function (dbName) {
  if (_.isEmpty(mysqlDb.pools[dbName])) {
    let k = 'mysql.' + dbName;
    let dbCfg = config.get(k);
    await mysqlDb.setConn(dbName, dbCfg);
  }

  return mysqlDb.getConn(dbName);
}

module.exports = common;