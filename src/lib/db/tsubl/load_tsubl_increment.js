'use strict';

var Config = require('../../util/config'),
    copyFrom = require('pg-copy-streams').from,
    dbUtils = require('../db-utils'),
    UrlStream = require('../../util/url-stream'),
    zlib = require('zlib');


// variables/data
var config = Config().get(),
    db,
    documents = require('./documents.json'),
    regions = require('./regions.json');

// methods
var connectDatabase,
    createIndexes,
    createSchema,
    insertRegions,
    insertDocuments,
    insertData;


/**
 * Get admin database connection.
 *
 * Sets `db` variable used by other methods below.
 */
connectDatabase = dbUtils.getAdminDb().then((adminDb) => {
  db = adminDb;
});


/**
 * Create database schema.
 *
 * Based on config.DB_SCHEMA_DETERMINISTIC.
 *
 * @return {Promise}
 *     promise representing schema has been created.
 */
createSchema = connectDatabase.then(() => {

  let schemaName = config.DB_SCHEMA_TSUBL;

  if (!schemaName) {
    throw new Error('tsubl schema name not configured');
  }

  return dbUtils.setSearchPath({
    db: db,
    name: config.DB_SCHEMA_TSUBL
  });
});

/**
 * Insert region metadata.
 *
 * @return {Promise<Array<String, Int>>}
 *     resolves to mapping from region name to region id.
 */
insertRegions = createSchema.then(() => {
  var promise,
      regionIds;

  // load regions
  promise = Promise.resolve();
  regionIds = {};
  regions.forEach((region) => {
    promise = promise.then(() => {
      return db.query(`
        INSERT INTO region (name) VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET NAME = ($1)
        RETURNING id
      `, [
        region.name
      ]).then((result) => {
        process.stdout.write('\r\nRESULT REGION INSERT -> ' + JSON.stringify(result));
        // save region id for later data loading
        regionIds[region.name] = result.rows[0].id;
      }).catch((err) => {
        process.stdout.write('\r\nData Load Error: ' + err);
      });
    });
  });

  return promise.then(() => {
    // all regions inserted, and IDs should be set
    return regionIds;
  });
});

/**
 * Insert document metadata.
 *
 * @return {Promise}
 *     promise representing document metadata being inserted.
 */
insertDocuments = insertRegions.then((regionIds) => {
  var promise;

  promise = Promise.resolve();
  documents.forEach((doc) => {
    doc.regions.forEach((region) => {
      var regionId;

      if (!regionIds.hasOwnProperty(region)) {
        throw new Error('Region "' + region + '" not found' +
            ', inserting document ' + doc.name);
      }
      regionId = regionIds[region];

      promise = promise.then(() => {
        return db.query(`
          INSERT INTO document (
            region_id,
            name
          ) VALUES ($1, $2)
          ON CONFLICT (region_id, name) DO NOTHING
        `, [
          regionId,
          doc.name
        ]);
      });
    });
  });

  return promise;
});


/**
 * Insert region data.
 *
 * @return {Promise}
 *     promise representing that all region data has been inserted.
 */
insertData = insertRegions.then((regionIds) => {
  var promise;

  promise = Promise.resolve();

  regions.forEach((region) => {
    // run each region load in sequence
    promise = promise.then(() => {

      process.stderr.write('Loading ' + region.name + ' region data\n');

      return db.query('DROP TABLE IF EXISTS temp_region_data CASCADE').then(() => {
        // create temporary table for loading data
        return db.query(`
          CREATE TABLE temp_region_data (
            value INTEGER NOT NULL,
            shape public.geography(Geometry,4326) NOT NULL
          )
        `);
      }).then(() => {
        // use copy from to read data
        return new Promise((resolve, reject) => {
          var data,
              doReject,
              doResolve,
              stream;

          data = UrlStream({
            url: region.url
          });

          stream = db.query(copyFrom(`
              COPY temp_region_data
              (value, shape)
              FROM STDIN
              WITH DELIMITER '|' CSV HEADER
          `));

          doReject = (err) => {
            data.destroy();
            reject(err);
          };

          doResolve = () => {
            data.destroy();
            resolve();
          };

          data.on('error', doReject);
          stream.on('error', doReject);
          stream.on('end', doResolve);
          data.pipe(zlib.createGunzip()).pipe(stream);
        });
      }).then(() => {
        // transfer data into actual table
        return db.query(`
          INSERT INTO data (
            region_id,
            value,
            shape
          ) (
            SELECT
              $1,
              value,
              shape
              FROM temp_region_data
          )
        `, [regionIds[region.name]]);
      }).then(() => {
        // remove temporary table
        return db.query('DROP TABLE temp_region_data CASCADE');
      });
    });
  });

  return promise;
});

createIndexes = Promise.all([insertData, insertDocuments]).then(() => {
  return dbUtils.readSqlFile(__dirname + '/./index.sql').then((statements) => {
    return dbUtils.exec(db, statements);
  });
});


// wait for indexes to finish loading
createIndexes.then(() => {
  process.stderr.write('Success!\n');
  process.exit(0);
}).catch((err) => {
  process.stderr.write('Error loading data\n');
  process.stderr.write(err.stack);
  process.exit(1);
});
