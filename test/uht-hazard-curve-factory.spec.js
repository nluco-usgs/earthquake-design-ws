/* global afterEach, beforeEach, describe, it */
'use strict';


var expect = require('chai').expect,
    express = require('express'),
    UHTHazardCurveFactory = require('../src/lib/uht-hazard-curve-factory');


describe('UHTHazardCurveFactory', () => {
  var factory;

  beforeEach(() => {
    factory = UHTHazardCurveFactory();
  });

  afterEach(() => {
    factory.destroy();
    factory = null;
  });

  describe('constructor', () => {
    it('is defined', () => {
      expect(typeof UHTHazardCurveFactory).to.equal('function');
    });

    it('can be instantiated', () => {
      expect(UHTHazardCurveFactory).to.not.throw(Error);
    });

    it('can be destroyed', () => {
      expect(() => {
        var factory;

        factory = UHTHazardCurveFactory();
        factory.destroy();
      }).to.not.throw(Error);
    });
  });

  describe('getDesignCurves', () => {
    var factory,
        metadata;

    beforeEach(function () {
      metadata = {
        getHazardMetadata: function (/*options*/) {
          return Promise.resolve({
            gridSpacing: 'gridSpacing',
            hazardEdition: 'hazardEdition',
            hazardRegion: 'hazardRegion',
          });
        }
      };

      factory = UHTHazardCurveFactory({
        metadata: metadata
      });
    });

    afterEach(function () {
      factory.destroy();
      factory = null;
      metadata = null;
    });

    it('Uses metadata to call getHazardCurves', function (done) {
      factory.getHazardCurves = function (options) {
        return Promise.resolve(options);
      };

      factory.getDesignCurves({
        designEdition: 'designEdition',
        latitude: 'latitude',
        longitude: 'longitude'
      }).then(function (results) {
        expect(results.gridSpacing).to.equal('gridSpacing');
        expect(results.hazardEdition).to.equal('hazardEdition');
        expect(results.hazardRegion).to.equal('hazardRegion');
        expect(results.latitude).to.equal('latitude');
        expect(results.longitude).to.equal('longitude');
      }).catch((err) => {
        return err;
      }).then((err) => {
        done(err);
      });

    });
  });

  describe('getGridPoints', () => {
    // NOTE that the tests below also verify the correct point return order
    // (top to bottom, left to right)

    it('returns one point when on grid', () => {
      var points;

      points = factory.getGridPoints({
        gridSpacing: 0.05,
        latitude: 34.05,
        longitude: -118.05
      });

      expect(points.length).to.equal(1);
      expect(points).to.deep.equal([
        {
          latitude: 34.05,
          longitude: -118.05
        }
      ]);
    });

    it('returns two points when on vertical line between grid', () => {
      var points;

      points = factory.getGridPoints({
        gridSpacing: 0.05,
        latitude: 34.06,
        longitude: -118.05
      });

      expect(points.length).to.equal(2);
      expect(points).to.deep.equal([
        {
          latitude: 34.10,
          longitude: -118.05
        },
        {
          latitude: 34.05,
          longitude: -118.05
        }
      ]);
    });

    it('returns two points when on horizontal line between grid', () => {
      var points;

      points = factory.getGridPoints({
        gridSpacing: 0.02,
        latitude: 34.04,
        longitude: -118.05
      });

      expect(points.length).to.equal(2);
      expect(points).to.deep.equal([
        {
          latitude: 34.04,
          longitude: -118.06
        },
        {
          latitude: 34.04,
          longitude: -118.04
        }
      ]);
    });

    it('returns four points when off grid', () => {
      var points;

      points = factory.getGridPoints({
        gridSpacing: 0.1,
        latitude: 34.05,
        longitude: -118.05
      });

      expect(points.length).to.equal(4);
      expect(points).to.deep.equal([
        {
          latitude: 34.1,
          longitude: -118.1
        },
        {
          latitude: 34.1,
          longitude: -118.0
        },
        {
          latitude: 34.0,
          longitude: -118.1
        },
        {
          latitude: 34.0,
          longitude: -118.0
        }
      ]);
    });
  });

  describe('getHazardCurves', () => {
    it('does stuff', (done) => {
      var options;

      // fake options for testing
      options = {
        gridSpacing: 'gridSpacing',
        hazardEdition: 'hazardEdition',
        hazardRegion: 'hazardRegion',
        latitude: 'latitude',
        longitude: 'longitude'
      };

      // stub methods called by getHazardCurves to verify order
      factory.getGridPoints = function (options) {
        // make sure requested gridSpacing and location are passed
        expect(options.gridSpacing).to.equal('gridSpacing');
        expect(options.latitude).to.equal('latitude');
        expect(options.longitude).to.equal('longitude');
        return [
          {
            latitude: 'lat1',
            longitude: 'lon1'
          },
          {
            latitude: 'lat2',
            longitude: 'lon2'
          }
        ];
      };
      factory.getHazardCurveUrl = function (options) {
        // make sure hazardEdition and hazardRegion are passed
        expect(options.hazardEdition).to.equal('hazardEdition');
        expect(options.hazardRegion).to.equal('hazardRegion');
        options.urled = true;
        return options;
      };
      factory.makeRequest = function (options) {
        // make sure url was generated before being requested
        expect(options.url.urled).to.equal(true);
        options.url.requested = true;
        options.url.spectralPeriod = 'spectralPeriod';
        return Promise.resolve(options.url);
      };
      factory.parseHazardCurves = function (options) {
        // make sure data was requested before being parsed
        expect(options.requested).to.equal(true);
        expect(options.spectralPeriod).to.equal('spectralPeriod');
        options.parsed = true;
        return [options];
      };

      // call getHazardCurves
      factory.getHazardCurves(options).then((curves) => {
        expect(curves.spectralPeriod[0]).to.deep.equal({
          'hazardEdition': 'hazardEdition',
          'hazardRegion': 'hazardRegion',
          'latitude': 'lat1',
          'longitude': 'lon1',
          'urled': true,
          'requested': true,
          'spectralPeriod': 'spectralPeriod',
          'parsed': true
        });
      }).catch((err) => {
        return err;
      }).then((err) => {
        done(err);
      });
    });
  });

  describe('getHazardCurveUrl', () => {
    var replacements;

    replacements = {
      hazardEdition: 'hazardEdition',
      hazardRegion: 'hazardRegion',
      latitude: 'latitude',
      longitude: 'longitude',
      imt: 'imt',
      vs30: 'vs30'
    };

    it('replaces {edition} with options.hazardEdition', () => {
      factory.url = '{edition}';
      expect(factory.getHazardCurveUrl(replacements)).to.equal('hazardEdition');
    });

    it('replaces {region} with options.hazardRegion', () => {
      factory.url = '{region}';
      expect(factory.getHazardCurveUrl(replacements)).to.equal('hazardRegion');
    });

    it('replaces {latitude} with options.latitude', () => {
      factory.url = '{latitude}';
      expect(factory.getHazardCurveUrl(replacements)).to.equal('latitude');
    });

    it('replaces {longitude} with options.longitude', () => {
      factory.url = '{longitude}';
      expect(factory.getHazardCurveUrl(replacements)).to.equal('longitude');
    });

    it('replaces {imt} with "any"', () => {
      factory.url = '{imt}';
      expect(factory.getHazardCurveUrl(replacements)).to.equal('any');
    });

    it('replaces {vs30} with "760"', () => {
      factory.url = '{vs30}';
      expect(factory.getHazardCurveUrl(replacements)).to.equal('760');
    });
  });

  describe('makeRequest', () => {
    var testApp,
        testPort,
        testServer;

    afterEach(() => {
      testServer.close();
    });

    beforeEach((done) => {
      testPort = 7999;
      testApp = express();
      testApp.use('', express.static('etc'));

      testServer = testApp.listen(testPort, () => { done(); });
    });

    it('returns the expected response', (done) => {
      var factory,
          result;

      factory = UHTHazardCurveFactory();

      result = factory.makeRequest({
        url: 'http://localhost:' + testPort + '/makeRequest.json'
      });

      result.then((data) => {
        expect(data).to.deep.equal({'test':'working'});
      }).catch((err) => {
        return err;
      }).then((err) => {
        done(err);
      });
    });
  });

  describe('parseHazardCurves', () => {
    it('parses', () => {
      var uhtResponse,
          parsed;

      uhtResponse = require('../etc/hazws-staticcurve-response.json');
      parsed = factory.parseHazardCurves(uhtResponse);

      expect(parsed.length).to.equal(7);
      expect(parsed[0]).to.deep.equal({
        hazardEdition: 'E2008R2',
        hazardRegion: 'COUS0P05',
        latitude: 34,
        longitude: -118,
        spectralPeriod: 'PGA',
        vs30: '760',
        data: [
          [0.005, 0.4679],
          [0.007, 0.3925],
          [0.0098, 0.3172],
          [0.0137, 0.248],
          [0.0192, 0.188],
          [0.0269, 0.139],
          [0.0376, 0.1006],
          [0.0527, 0.07031],
          [0.0738, 0.04694],
          [0.103, 0.02956],
          [0.145, 0.0171],
          [0.203, 0.00937],
          [0.284, 0.004966],
          [0.397, 0.002603],
          [0.556, 0.001316],
          [0.778, 0.0006023],
          [1.09, 0.0002285],
          [1.52, 0.00006808],
          [2.13, 0.00001371]
        ]
      });
    });
  });
});
