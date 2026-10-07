// Opt-in preloader for unchanged historical suites under the isolated candidate.
const fs = require('node:fs')
const helpers = require('../helpers.cjs')
const distribute = require('./joint-create-distributed.cjs')
const initialize = helpers.initialize
helpers.initialize = rules => initialize(distribute(rules ?? fs.readFileSync('tests/rules/fixtures/joint-create-pre-distribution.rules', 'utf8')))
