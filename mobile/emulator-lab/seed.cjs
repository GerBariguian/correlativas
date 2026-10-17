'use strict'
const {seedAuth,seedFirestore}=require('./fixtures.cjs')
;(async()=>{await seedAuth();await seedFirestore();console.log('Only local demo fixtures seeded')})().catch(e=>{console.error(e.message);process.exitCode=1})
