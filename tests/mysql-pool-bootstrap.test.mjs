import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMariaDbReadPoolOptions, MariaDbConfigurationError } from '../dist-core/connections/mysql-pool-policy.js';
import { openMariaDbReadBoundary, MariaDbConnectionError } from '../dist-core/connections/mysql-pool-bootstrap.js';

const config = {hostname:'host.example.com',username:'mcp_read',password:'synthetic-only-password',database:'mcp_read_model'};
const wrapper = {async wrapKey(){throw Error('Not configured');},async unwrapKey(){throw Error('Not configured');}};

test('remote MariaDB options enforce verified TLS, narrow connection pool and prepared-query compatibility', () => {
 const options=buildMariaDbReadPoolOptions(config);
 assert.equal(options.host,'host.example.com');
 assert.deepEqual(options.ssl,{rejectUnauthorized:true,verifyIdentity:true,minVersion:'TLSv1.2'});
 assert.equal(options.multipleStatements,false);
 assert.equal(options.connectionLimit,4);
 assert.equal(options.queueLimit,16);
 assert.equal(options.connectTimeout,5000);
 assert.equal(Object.hasOwn(options,'socketPath'),false);
});

test('invalid remote config cannot open a connection or bypass TLS', async () => {
 const bad = [
   {...config,hostname:'127.0.0.1'},
   {...config,hostname:'host.example.com:3306'},
   {...config,username:'root;DROP'},
   {...config,port:3307},
   {...config,database:'../mysql'},
   {...config,password:''},
   {...config,password:'a\nsecret'},
   {...config,caPem:'file:///etc/ssl/cert.pem'},
   {...config,caPem:'-----BEGIN PRIVATE KEY-----'},
 ];
 for(const input of bad) assert.throws(()=>buildMariaDbReadPoolOptions(input),MariaDbConfigurationError);
 let calls=0;
 await assert.rejects(openMariaDbReadBoundary(bad[0],wrapper,{createPool(){calls++; throw Error('unreachable');}}),MariaDbConfigurationError);
 assert.equal(calls,0);
});

test('successful TLS preflight releases session, installs read boundary and closes pool', async () => {
 let released=0, ended=0, queries=0;
 const factory={createPool(options) {
   assert.equal(options.ssl.rejectUnauthorized,true);
   return {
     async getConnection(){return {async query(sql){queries++; assert.match(sql,/Ssl_cipher/);return [[{Value:'TLS_AES_256_GCM_SHA384'}],[]];},release(){released++;}};},
     async execute(){return [[],[]];},async end(){ended++;}
   };
 }};
 const result=await openMariaDbReadBoundary(config,wrapper,factory);
 assert.equal(typeof result.connections.get,'function');
 assert.equal(typeof result.vault.getSecret,'function');
 assert.equal(released,1); assert.equal(queries,1); assert.equal(ended,0);
 await result.close();assert.equal(ended,1);
});

test('failed TLS preflight is denied, session released, pool closed, errors redacted', async () => {
 for(const response of [[],[{Value:''}],[{Value:0}],[{Value:'x'},{Value:'x'}]]) {
   let released=0,ended=0;
   const factory={createPool(){return {
     async getConnection(){return {async query(){return [response,[]];},release(){released++;}};},
     async execute(){throw Error('unreachable');},async end(){ended++;}
   };}};
   await assert.rejects(openMariaDbReadBoundary(config,wrapper,factory),e=>e instanceof MariaDbConnectionError && e.message==='MARIADB_SECURE_CONNECTION_FAILED');
   assert.equal(released,1); assert.equal(ended,1);
 }
});

test('network failure and connection failure close pool without leaking credentials', async () => {
 let closed=0;
 const factory={createPool(){return {
   async getConnection(){throw Error('password=synthetic-only-password');},
   async execute(){throw Error('unreachable');}, async end(){closed++;}
 };}};
 await assert.rejects(openMariaDbReadBoundary(config,wrapper,factory),e=>e instanceof MariaDbConnectionError && !e.message.includes('synthetic-only-password'));
 assert.equal(closed,1);
});
