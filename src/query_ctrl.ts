///<reference path="../headers/common.d.ts" />

import angular from 'angular';
import _ from 'lodash';
import {QueryCtrl} from './sdk/sdk';
import {CrateQueryBuilder} from './query_builder';
import queryDef from './query_def';

export class CrateDatasourceQueryCtrl extends QueryCtrl {
  static templateUrl = 'partials/query.editor.html';

  crateQueryBuilder: CrateQueryBuilder;
  groupBySegments: any;
  whereSegments: any;
  removeWhereSegment: any;

  operators: any;
  aliasBySegment: any;

  constructor($scope, $injector, private $q, private uiSegmentSrv)  {
    super($scope, $injector);

    this.uiSegmentSrv = uiSegmentSrv;

    let ds = this.datasource;
    this.crateQueryBuilder = new CrateQueryBuilder(ds.schema,
                                                   ds.table,
                                                   ds.defaultTimeColumn,
                                                   ds.defaultGroupInterval);

    this.operators = {
      compare: ['<', '>', '<=', '>=', '=', '<>', '!=', 'like'],
      regex: ['~', '!~']
    };

    var target_defaults = {
      metricAggs: [
        {type: 'avg', column: 'value'}
      ],
      selectColumns: ["*"],
      groupByColumns: ['host'],
      whereClauses: [],
      aliasBy: "*"
    };
    _.defaults(this.target, target_defaults);

    this.groupBySegments = _.map(this.target.groupByColumns, this.uiSegmentSrv.newSegment);
    this.aliasBySegment = this.uiSegmentSrv.newSegment(this.target.aliasBy);

    // Build WHERE segments
    this.whereSegments = [];
    var self = this;
    _.forEach(this.target.whereClauses, whereClause => {
      if (whereClause.condition) {
        self.whereSegments.push(uiSegmentSrv.newCondition(whereClause.condition));
      }
      self.whereSegments.push(uiSegmentSrv.newKey(whereClause.key));
      self.whereSegments.push(uiSegmentSrv.newOperator(whereClause.operator));
      self.whereSegments.push(uiSegmentSrv.newKeyValue(whereClause.value));
    });

    this.removeWhereSegment = uiSegmentSrv.newSegment({fake: true, value: '-- remove --'});
    this.fixSegments(this.whereSegments);
    this.fixSegments(this.groupBySegments);
  }

  crateQuery(query) {
    return this.datasource._sql_query(query).then(response => {
      return response.data.rows;
    });
  }

  getCollapsedText(): string {
    return this.crateQueryBuilder.build(this.target);
  }

  ////////////////////
  // Event handlers //
  ////////////////////

  onChangeInternal(): void {
    this.panelCtrl.refresh(); // Asks the panel to refresh data.
  }

  groupBySegmentChanged(segment, index): void {
    if (segment.type === 'plus-button') {
      segment.type = undefined;
    }
    this.target.groupByColumns = _.map(_.filter(this.groupBySegments, segment => {
      return (segment.type !== 'plus-button' &&
              segment.value !== this.removeWhereSegment.value);
    }), 'value');
    this.groupBySegments = _.map(this.target.groupByColumns, this.uiSegmentSrv.newSegment);
    this.groupBySegments.push(this.uiSegmentSrv.newPlusButton());
    this.onChangeInternal();
  }

  aliasBySegmentChanged(): void {
    this.target.aliasBy = this.aliasBySegment.value;
    this.onChangeInternal();
  }

  addMetricAgg(): void {
    this.target.metricAggs.push({ type: 'avg', column: 'value' });
  }

  removeMetricAgg(index): void {
    this.target.metricAggs.splice(index, 1);
  }

  toggleEditorMode(): void {
    this.target.rawQuery = !this.target.rawQuery;
  }

  ///////////////////////
  // Query suggestions //
  ///////////////////////

  getColumns() {
    let self = this;
    return this.crateQuery(this.crateQueryBuilder.getColumnsQuery())
      .then(rows => {
        return self.transformToSegments(_.flatten(rows));
      });
  }

  getGroupByColumns() {
    return this.getColumns().then(columns => {
      columns.splice(0, 0, angular.copy(this.removeWhereSegment));
      return columns;
    });
  }

  getValues(column, limit = 10) {
    let self = this;
    return this.crateQuery(this.crateQueryBuilder.getValuesQuery(column, limit))
      .then(rows => {
        return self.transformToSegments(_.flatten(rows));
      });
  }

  getColumnsOrValues(segment, index) {
    if (segment.type === 'condition') {
      return this.$q.when([this.uiSegmentSrv.newSegment('AND'), this.uiSegmentSrv.newSegment('OR')]);
    }
    if (segment.type === 'operator') {
      return this.$q.when(this.uiSegmentSrv.newOperators(this.operators.compare));
    }

    if (segment.type === 'key' || segment.type === 'plus-button') {
      return this.getColumns().then(columns => {
        columns.splice(0, 0, angular.copy(this.removeWhereSegment));
        return columns;
      });
    } else if (segment.type === 'value') {
      return this.getValues(this.whereSegments[index - 2].value).then(columns => {
        return columns;
      });
    }
  }

  getMetricAggTypes() {
    return queryDef.getMetricAggTypes();
  }

  getMetricAggDef(aggType) {
    return _.findWhere(this.getMetricAggTypes(), { value: aggType });
  }

  whereSegmentUpdated(segment, index) {
    this.whereSegments[index] = segment;

    if (segment.value === this.removeWhereSegment.value) {
      this.whereSegments.splice(index, 3);
      if (this.whereSegments.length === 0) {
        this.whereSegments.push(this.uiSegmentSrv.newPlusButton());
      } else if (this.whereSegments.length > 2) {
        this.whereSegments.splice(Math.max(index - 1, 0), 1);
        if (this.whereSegments[this.whereSegments.length - 1].type !== 'plus-button') {
          this.whereSegments.push(this.uiSegmentSrv.newPlusButton());
        }
      }
    } else {
      if (segment.type === 'plus-button') {
        if (index > 2) {
          this.whereSegments.splice(index, 0, this.uiSegmentSrv.newCondition('AND'));
        }
        this.whereSegments.push(this.uiSegmentSrv.newOperator('='));
        this.whereSegments.push(this.uiSegmentSrv.newFake('select tag value', 'value', 'query-segment-value'));
        segment.type = 'key';
        segment.cssClass = 'query-segment-key';
      }
      if ((index + 1) === this.whereSegments.length) {
        this.whereSegments.push(this.uiSegmentSrv.newPlusButton());
      }
    }

    this.buildWhereClauses();

    // Refresh only if all fields setted
    if (_.every(this.whereSegments, segment => {
      return ((segment.value || segment.type === 'plus-button') &&
              !(segment.fake && segment.type !== 'plus-button'));
    })) {
      this.panelCtrl.refresh();
    }
  }

  buildWhereClauses() {
    var i = 0;
    var whereIndex = 0;
    var segments = this.whereSegments;
    var whereClauses = this.target.whereClauses;
    while (segments.length > i && segments[i].type !== 'plus-button') {
      if (whereClauses.length < whereIndex + 1) {
        whereClauses.push({condition: '', key: '', operator: '', value: ''});
      }
      if (segments[i].type === 'condition') {
        whereClauses[whereIndex].condition = segments[i].value;
      } else if (segments[i].type === 'key') {
        whereClauses[whereIndex].key = segments[i].value;
      } else if (segments[i].type === 'operator') {
        whereClauses[whereIndex].operator = segments[i].value;
      } else if (segments[i].type === 'value') {
        whereClauses[whereIndex].value = segments[i].value;
        whereIndex++;
      }
      i++;
    }
  }

  fixSegments(segments) {
    var count = segments.length;
    var lastSegment = segments[Math.max(count-1, 0)];

    if (!lastSegment || lastSegment.type !== 'plus-button') {
      segments.push(this.uiSegmentSrv.newPlusButton());
    }
  }

  transformToSegments(results) {
    var segments = _.map(_.flatten(results), value => {
      return this.uiSegmentSrv.newSegment({
        value: value.toString(),
        expandable: false
      });
    });
    return segments;
  }

}
