'use strict';


var extend = require('extend'),
    MetadataFactory = require('./metadata-factory'),
    NumberUtils = require('./util/number-utils').instance;


var _DEFAULTS,
    _QUERY_DATA,
    _QUERY_DOCUMENT,
    _QUERY_REGION;


/**
 * @param $1 {Double}
 *     Latitude decimal degrees
 * @param $2 {Double}
 *     Longitude decimal degrees
 * @param $3 {Double}
 *     Grid spacing
 */
_QUERY_DATA = `
  SELECT
    *
  FROM
    data
  WHERE
    region_id = $1 AND
    latitude < ($2::Numeric + $4::Numeric) AND
    latitude > ($2::Numeric - $4::Numeric) AND
    longitude < ($3::Numeric + $4::Numeric) AND
    longitude > ($3::Numeric - $4::Numeric)
  ORDER BY
    latitude DESC,
    longitude ASC
`;

/**
 * @param $1 {String}
 *     Reference document identifier
 * @param $2 {Number}
 *     Latitude decimal degrees
 * @param $3 {Number}
 *     Longitude decimal degrees
 */
_QUERY_REGION = `
  SELECT
    r.*
  FROM
    region AS r
  JOIN
    document AS d
  ON
    r.id = d.region_id
  WHERE
    d.name = $1 AND
    max_latitude >= $2 AND
    max_longitude >= $3 AND
    min_latitude <= $2 AND
    min_longitude <= $3
`;

/**
 * @param $1 {Number}
 *     Region ID
 */
_QUERY_DOCUMENT = `
  SELECT
    *
  FROM
    document
  WHERE
    region_id = $1 AND
    name = $2
`;

_DEFAULTS = {
  db: {query: () => Promise.resolve({rows: []})},
  queryData: _QUERY_DATA,
  queryDocument: _QUERY_DOCUMENT,
  queryRegion: _QUERY_REGION
};


/**
 * Factory for fetching arbitrary gridded data from a database. The schema
 * for the database must adhere to specific requirements for this factory to
 * function properly with it.
 *
 * @param options {Object}
 *     options.db {Pool}
 *         A database connection pool
 *     options.queryData {String}
 *         SQL to query data from the schema
 *     options.queryDocument {String}
 *         SQL to query documents from the schema
 *     options.queryRegion {String}
 *         SQL to query regions from the schema
 */
var GriddedDataFactory = function (options) {
  var _this,
      _initialize;


  _this = {};

  /**
   * Constructor.
   *
   * @param options {Object}
   *     See class documentation for details.
   */
  _initialize = function (options) {
    options = extend({}, _DEFAULTS, options);

    _this.db = options.db;
    _this.metadataFactory = options.metadataFactory;
    _this.queryData = options.queryData;
    _this.queryDocument = options.queryDocument;
    _this.queryRegion = options.queryRegion;

    if (!_this.metadataFactory) {
      _this.destroyMetadataFactory = true;
      _this.metadataFactory = MetadataFactory();
    }
  };


  /**
   * Free resources associated with this factory instance.
   *
   */
  _this.destroy = function () {
    if (_this === null) {
      return;
    }

    if (_this.destroyMetadataFactory) {
      delete _this.destroyMetadataFactory;
      _this.metadataFactory.destroy();
    }

    _initialize = null;
    _this = null;
  };

  /**
   * @APIMethod
   *
   * General method called by a handler to fetch data and metadata from the
   * factory.
   *
   * @param inputs {Object}
   *     Any arbitrary inputs required for queries to succeed. Typically...
   *     inputs.latitude {Number}
   *     inputs.longitude {Number}
   *     inputs.referenceDocument {String}
   *
   * @return {Promise<Object>}
   *     A promise that resolves with the data and metadata for the provided
   *     inputs, or rejects if an error occurs.
   */
  _this.get = function (inputs) {
    var metadata;

    return _this.getMetadata(inputs).then((result) => {
      metadata = result;
      return _this.getData(metadata, inputs);
    }).then((data) => {
      return {
        data: data,
        metadata: metadata
      };
    });
  };

  /**
   * @HelperMethod
   *
   * Fetches the gridded data from the database and resolves the returned
   * promise with the interpolated results.
   *
   * @param metadata {Object}
   *     metadata.region.id {Number}
   *     metadata.region.grid_spacing {Number}
   * @param inputs {Object}
   *     inputs.latitude {Number}
   *     inputs.longitude {Number}
   *
   * @return {Promise<Object>}
   *     A promise that resolves with interpolated results of gridded data
   *     from the database or rejects if an error occurs.
   */
  _this.getData = function (metadata, inputs) {
    var parameters;

    inputs = inputs || {};
    metadata = metadata || {};
    metadata.region = metadata.region || {};

    // TODO, figure out how to read the right region (for id and grid_spacing)
    parameters = [
      parseInt(metadata.region.id, 10),         // _QUERY_DATA::$1
      parseFloat(inputs.latitude),              // _QUERY_DATA::$2
      parseFloat(inputs.longitude),             // _QUERY_DATA::$3
      parseFloat(metadata.region.grid_spacing)  // _QUERY_DATA::$4
    ];

    return _this.db.query(_this.queryData, parameters).then((result) => {
      return _this.interpolate(result.rows, inputs, metadata);
    });
  };

  /**
   * @HelperMethod
   *
   * Gets metadata associated with a particular document based on the
   * provided `inputs.referenceDocument` and `region.id`.
   *
   * @param inputs {Object}
   *     inputs.referenceDocument {String}
   * @param region {Object}
   *     region.id {Number}
   *
   * @return {Promise<Object>}
   *     A promise that resolves with document metadata or rejects if an
   *     error occurs.
   */
  _this.getDocument = function (inputs, region) {
    var parameters;


    parameters = [
      parseInt(region.id, 10), // _QUERY_DOCUMENT::$1
      inputs.referenceDocument // _QUERY_DOCUMENT::$2
    ];

    return _this.db.query(_this.queryDocument, parameters).then((result) => {
      return result.rows[0];
    });
  };

  /**
   * @HelperMethod
   *
   * Gets document and region metadata for the provided inputs.
   *
   * @param inputs {Object}
   *     inputs.latitude {Number}
   *     inputs.longitude {Number}
   *     inputs.referenceDocument {String}
   *
   * @return {Promise<Object>}
   *     A promise that resolves with metadata or rejects if an error occurs.
   */
  _this.getMetadata = function (inputs) {
    let metadata,
        region;

    return Promise.all([
      _this.getRegion(inputs),
      _this.metadataFactory.getMetadata(inputs)
    ]).then((promiseResults) => {
      region = promiseResults[0];
      metadata = promiseResults[1];

      return _this.getDocument(inputs, region);
    }).then((promiseResult) => {
      return {
        document: promiseResult,
        metadata: metadata,
        region: region,
      };
    });
  };

  /**
   * Gets metadata associated with a particular region based on the provided
   * `inputs.latitude` and `inputs.longitude`.
   *
   * @param inputs {Object}
   *     inputs.referenceDocument {String}
   *     inputs.latitude` {Number}
   *     inputs.longitude` {Number}
   *
   * @return {Promise<Object>}
   *     A promise that resolves with region metadata or rejects if an
   *     error occurs.
   */
  _this.getRegion = function (inputs) {
    var parameters;

    parameters = [
      inputs.referenceDocument,    // _QUERY_REGION::$1
      parseFloat(inputs.latitude), // _QUERY_REGION::$2
      parseFloat(inputs.longitude) // _QUERY_REGION::$3
    ];

    return _this.db.query(_this.queryRegion, parameters).then((result) => {
      return result.rows[0];
    });
  };

  /**
   * @HelperMethod
   *
   * Performs bi-linear spatial interpolation on the provided parameters.
   * Currently defers to `NumberUtils.spatialInterpolate` method.
   *
   * @param rows {Array}
   *     An ordered array of results from the database. Contains
   *     latitude/longitude/valueX properties for each matching grid point.
   *     Non-numeric values corresponding to a property on the rows object
   *     will have undefined results.
   * @param inputs {Object}
   *     inputs.latitude {Number}
   *     inputs.longitude {Number}
   * @param metadata {Object}
   *     metadata.metadata.spatialInterpolationMethod {String}
   *
   * @see util/NumberUtils#spatialInterpolate
   *
   * @return {Object}
   *     An object containing spatially interpolated results
   */
  _this.interpolate = function (rows, inputs, metadata) {
    return NumberUtils.spatialInterpolate(rows, inputs.latitude,
        inputs.longitude, metadata.metadata.spatialInterpolationMethod);
  };


  _initialize(options);
  options = null;
  return _this;
};


module.exports = GriddedDataFactory;
