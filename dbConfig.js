const { Pool } = require('pg')

const pool = new Pool({
    user: 'postgres',
    host: '10.25.88.14',
    database: 'postgres',
    password: 'changeme',
    port: 5432,
    min: 4,
    max: 10,
    idleTimeoutMillis: 1000,
    keepAlive:true
})
pool.on('error', (err, cli) => {
    console.log('postgres connection error : ' + err)
})

module.exports = pool
