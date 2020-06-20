'use strict';

const common = require('../common/common');

// 字段
class Filed {
  constructor(name, id, index) {
    this.name = name;
    this.value = null;
    this.id = id;
    this.index = index;
  }
  setValue(value) {
    this.value = value;
  }
  hasValue() {
    return !(this.value === null);
  }
}

// 表
class table {
  constructor() {
    this.tableName = 'Multi_Test1';
    this.fields = new Map();
    this.fields.set('1001', [
      new Filed('GameSvrId', '1001', 1),
      new Filed('EventTime', '1001', 2),
      new Filed('PlatID', '1001', 4),
      new Filed('AreaID', '1001', 7),
      new Filed('PlayerID', '1001', 3),
      new Filed('Level', '1001', 8),
      new Filed('Density', '1001', 10)
    ]).set('1002', [
      new Filed('OnlineTime', '1002', 5)
    ]).set('1003', [
      new Filed('IState', '1003', 13),
      new Filed('IReason', '1003', 15)
    ]);
  }
  getFileds(id) {
    return this.fields.get(id);
  }
  isReady() {
    for (let [_, fArr] of this.fields) {
      for (let f of fArr) {
        if (!f.hasValue()) {
          return false;
        }
      }
    }
    return true;
  }
  genInsertSql() {
    let i = 0;
    let params = [];
    let sql = 'INSERT INTO ' + this.tableName + ' (';
    let tmp = '';
    for (let [_, fArr] of this.fields) {
      for (let f of fArr) {
        sql += f.name + ', ';
        tmp += '?, ';
        params.push(f.value);
      }
    }
    sql = sql.slice(0, sql.length-2);
    tmp = tmp.slice(0, tmp.length-2);
    sql += ') VALUES (' + tmp + ')';
    return [sql, params];
  }
}

// 多日志落库
class Test1 {
  constructor(size) {
    this.multiPlayerIdIndex = new Map();
    this.multiPlayerIdIndex.set('1001', 3).set('1002', 3).set('1003', 10);
    this.caches = new Map();
    this.maxCacheSize = size;
  }
  getPlayerIdIndex(id) {
    return this.multiPlayerIdIndex.get(id);
  }
  getCache(playerId) {
    if (this.caches.has(playerId)) {
      return this.caches.get(playerId);
    }
    this.caches.set(playerId, new table());
    return this.caches.get(playerId);
  }
  delCache(playerId) {
    this.caches.delete(playerId);
  }
  rmOldCache() {
    if (this.caches.size <= this.maxCacheSize) {
      return;
    }
    this.caches.forEach((_, key, map) => {
      map.delete(key);
      if (map.size <= this.maxCacheSize) {
        return;
      }
    });
  }
}
let test1 = new Test1(10);

// work
module.exports = function(d) {
  let arrRst = [null, null];
  if (common.isNullOrUndefined(d)) {
    return arrRst;
  }
  let playerIdIndex = test1.getPlayerIdIndex(d.logId);
  if (playerIdIndex === undefined) {
    return arrRst;
  }
  let [arrLogs, processInfo, processTime, rawLogId, rawLogName] = common.logMsg2Arr(d);
  if (arrLogs === null) {
    return arrRst;
  }
  let playerId = arrLogs[playerIdIndex];
  if (!common.strIsNumber(playerId)) {
    return arrRst;
  }
  let table = test1.getCache(playerId);
  let fields = table.getFileds(d.logId)
  if (fields === undefined) {
    return arrRst;
  }
  for (let f of fields) { 
    let value = arrLogs[f.index];
    if (common.isNullOrUndefined(value)) {
      test1.delCache(playerId);
      return arrRst;
    }
    f.setValue(value);
  }
  if (!table.isReady()) {
    return arrRst;
  }
  let [sql, params] = table.genInsertSql();
  test1.delCache(playerId);
  test1.rmOldCache();
  return [sql, params];
}