'use strict';

const _ = require('underscore');
const mysql = require('mysql2/promise');
const config = require('config');
const logger = require('./logger');

let mysqlDb = {
  pools: {},
  curPool: null
};

// 组装SQL语句，便于记录日志
let formatSql = function (rawSql, params) {
  let sqlStr = rawSql;
  if (!_.isEmpty(params)) {
    let i = 0;
    sqlStr = rawSql.replace(/\?/g, function (match) {
      let val = _.isUndefined(params[i]) ? match : params[i];
      ++i;
      return val;
    });
  }
  return sqlStr;
};

// 记录日志
let logSql = function (rawSql, params) {
  if (config.has('mysql.log') && config.get('mysql.log') === true) {
    logger.debug(formatSql(rawSql, params));
  }
};

// 检查参数
let checkParams = function (params) {
  let len = params.length;
  for (let i = 0; i < len; ++i) {
    if (params[i] === void(0) || params[i] === null) {
      throw new Error('params contains undefined value');
    }
  }
};

// 设置mysqldb对象
mysqlDb.setConn = async function (name, opts) {
  this.pools[name] = await mysql.createPool(opts);
};

// 获取mysql操作集
mysqlDb.getConn = function (dbName) {
  let pool = this.pools[dbName];
  if (_.isEmpty(pool)) {
    pool = this.curPool || {};
  } else {
    this.curPool = pool;
  }

  return {
    query: async function (rawSql, params) {
      logSql(rawSql, params);
      checkParams(params);
      // 用完以后pool中的conn会重新放入池中，源代码得知
      return await pool.query(rawSql, params);
    },
    execute: async function (rawSql, params) {
      logSql(rawSql, params);
      checkParams(params);
      return await pool.execute(rawSql, params);
    },
    end: async function () {
      return await pool.end();
    }
  };
};

module.exports = mysqlDb;