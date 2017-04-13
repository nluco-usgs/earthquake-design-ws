'use strict';

var ASCE41_13Factory = require('./asce41_13-factory'),
    SiteAmplificationFactory = require('./site-amplification-factory'),
    SpectraFactory = require('./spectra-factory'),
    WebServiceAccessor = require('./util/web-service-accessor');

var ASCE41_13Handler = function (options) {
  var _this,
      _initialize;


  _this = {};

  _initialize = function (options) {
    options = options || {};

    if (options.factory) {
      _this.factory = options.factory;
    } else {
      // TODO :: Create custom ASCE 41-13 Factory and use. Issue #64.
      _this.destroyFactory = true;

      _this.factory = ASCE41_13Factory({
        probabilisticService: WebServiceAccessor(
          {url: options.PROBABILISTIC_SERVICE_URL}),

        riskCoefficientService: WebServiceAccessor(
          {url: options.RISK_COEFFICIENT_SERVICE_URL}),

        deterministicService: WebServiceAccessor(
          {url: options.DETERMINISTIC_SERVICE_URL}),

        siteAmplificationFactory: SiteAmplificationFactory(),

        spectraFactory: SpectraFactory()
      });
    }
  };


  /**
   * Checks params for null or undefined values.
   *
   * @param params {Object}
   *    Object containing required parameters.
   *
   * @return {Promise<array, Error>}
   *    A promise resolving with an array of missing parameter(s) and error or
   *    resolves with params if all values pass checks.
   */
  _this.checkParams = function (params) {
    var buf,
        err,
        latitude,
        longitude,
        siteClass;

    buf = [];

    params = params || {};
    params.referenceDocument = 'ASCE41-13';

    latitude = params.latitude;
    longitude = params.longitude;
    siteClass = params.siteClass;

    if (typeof latitude === 'undefined' || latitude === null) {
      buf.push('latitude');
    }

    if (typeof longitude === 'undefined' || longitude === null) {
      buf.push('longitude');
    }

    if (typeof siteClass === 'undefined' || siteClass === null) {
      buf.push('siteClass');
    }

    if (buf.length > 0) {
      err = new Error('Missing required parameter' +
          (buf.length > 1 ? 's' : '') + ': ' + buf.join(', '));
      err.status = 400;
      return Promise.reject(err);
    }

    return Promise.resolve(params);
  };

  /**
   * Destroy all the things.
   *
   */
  _this.destroy = function () {
    if (_this === null) {
      return;
    }

    // TODO :: Destroy more things

    _this.factory = null;
    _this.legacyFactory = null;

    _initialize = null;
    _this = null;
  };

  _this.formatResult = function (result) {
    return new Promise((resolve, reject) => {
      try {
        return resolve(result);
      } catch (err) {
        return reject(err);
      }
    });
  };

  /**
   * Handles GET request for data
   *
   * @param params {object}
   *    request parameters.
   * @return {Promise}
   *    A promise that resolves with and error or calls
   *    factory.getDesignData with params.
   */
  _this.get = function (params) {
    return _this.checkParams(params).then((params) => {
      return _this.factory.get(params);
    }).then((result) => {
      return _this.formatResult(result);
    });
  };


  _initialize(options);
  options = null;
  return _this;
};


module.exports = ASCE41_13Handler;
