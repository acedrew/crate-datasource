//import {describe, beforeEach, it, sinon, expect} from '../utils/test_common';
import handleResponse from '../response_handler';

describe('Response Handler', function() {
  var ctx = {};

  describe('When handling Crate response', function() {

    beforeEach(function() {
      ctx.target = {};
      ctx.crateResponse = {};
    });

    it('should convert timeseries data to grafana format', function(done) {
      ctx.target =  {
        "groupByColumns": [],
        "metricAggs": [
          {"column": "value", "type": "avg"}
        ],
        "whereClauses": []
      };

      ctx.crateResponse = {
        "cols": ["time","avg(value)"],
        "duration": 16,
        "rowcount":5,
        "rows":[
          [1466640780000,1.2562332153320312],
          [1466640840000,1.1889413595199585],
          [1466640900000,1.3127131064732869],
          [1466640960000,1.3972599903742473],
          [1466641020000,1.27950386206309]
        ]
      };

      var result = handleResponse(ctx.target, ctx.crateResponse);
      expect(result[0].datapoints).to.deep.equal([
        [1.2562332153320312,1466640780000],
        [1.1889413595199585,1466640840000],
        [1.3127131064732869,1466640900000],
        [1.3972599903742473,1466640960000],
        [1.27950386206309,1466641020000]
      ]);
      done();
    });

    // TODO: find better default metric name
    it('should set metric name if no group by columns selected', function(done) {
      ctx.target =  {
        "groupByColumns": [],
        "metricAggs": [
          {"column": "value", "type": "avg"}
        ],
        "whereClauses": []
      };

      ctx.crateResponse = {
        "cols": ["time","avg(value)"],
        "duration": 16,
        "rowcount":5,
        "rows":[
          [1466640780000,1.2562332153320312],
          [1466640840000,1.1889413595199585],
          [1466640900000,1.3127131064732869],
          [1466640960000,1.3972599903742473],
          [1466641020000,1.27950386206309]
        ]
      };

      var result = handleResponse(ctx.target, ctx.crateResponse);
      var series = result[0];
      expect(series).to.have.property('target');
      expect(series).to.have.property('datapoints');
      //expect(series.target).to.equal("");
      done();
    });

    it('should group response by selected columns', function(done) {
      ctx.target =  {
        "groupByColumns": ["host"],
        "metricAggs": [
          {"column": "value", "type": "avg"}
        ],
        "whereClauses": []
      };

      ctx.crateResponse = {
        "cols": ["time","avg(value)","host"],
        "duration": 16,
        "rowcount":10,
        "rows":[
          [1466640780000,1.2562332153320312,"backend01"],
          [1466640840000,1.1889413595199585,"backend01"],
          [1466640900000,1.3127131064732869,"backend01"],
          [1466640960000,1.3972599903742473,"backend01"],
          [1466641020000,1.27950386206309,"backend01"],
          [1466641080000,1.3942841291427612,"backend02"],
          [1466641140000,1.245995541413625,"backend02"],
          [1466641200000,1.3355928659439087,"backend02"],
          [1466641260000,1.2358959714571636,"backend02"],
          [1466641320000,1.4172419905662537,"backend02"]
        ]
      };

      var result = handleResponse(ctx.target, ctx.crateResponse);
      expect(result.length).to.equal(2);
      expect(result[0]).to.have.property('target');
      expect(result[0]).to.have.property('datapoints');
      expect(result[0].target).to.equal('backend01: avg(value)');
      expect(result[1]).to.have.property('target');
      expect(result[1]).to.have.property('datapoints');
      expect(result[1].target).to.equal('backend02: avg(value)');
      done();
    });

    it('should transform to set of series for all group by columns', function(done) {
      ctx.target =  {
        "groupByColumns": ["host", "metric"],
        "metricAggs": [
          {"column": "value", "type": "avg"}
        ],
        "whereClauses": []
      };

      ctx.crateResponse = {
        "cols": ["time","avg(value)","host", "metric"],
        "duration": 16,
        "rowcount":10,
        "rows":[
          [1466640780000,1.2562332153320312,"backend01", "load1"],
          [1466640840000,1.1889413595199585,"backend01", "load1"],

          [1466640900000,1.3127131064732869,"backend01", "load5"],
          [1466640960000,1.3972599903742473,"backend01", "load5"],
          [1466641020000,1.27950386206309,  "backend01", "load5"],

          [1466641080000,1.3942841291427612,"backend02", "load1"],
          [1466641140000,1.245995541413625, "backend02", "load1"],

          [1466641200000,1.3355928659439087,"backend02", "load5"],
          [1466641260000,1.2358959714571636,"backend02", "load5"],
          [1466641320000,1.4172419905662537,"backend02", "load5"]
        ]
      };

      var result = handleResponse(ctx.target, ctx.crateResponse);
      expect(result.length).to.equal(4);
      expect(result[0].datapoints).to.deep.equal([
        [1.2562332153320312,1466640780000],
        [1.1889413595199585,1466640840000]
      ]);
      expect(result[0].target).to.equal('backend01 load1: avg(value)');
      done();
    });

  });
});
