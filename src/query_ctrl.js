import angular from 'angular';
import _ from 'lodash';
import {QueryCtrl} from 'app/plugins/sdk';
import * as queryBuilder from './query_builder';

export class CrateDatasourceQueryCtrl extends QueryCtrl {

  constructor($scope, $injector, $q, uiSegmentSrv)  {
    super($scope, $injector);

    this.scope = $scope;
    this.$q = $q;
    this.uiSegmentSrv = uiSegmentSrv;

    this.operators = {
      compare: ['<', '>', '<=', '>=', '=', '<>', '!=', 'like'],
      regex: ['~', '!~']
    };

    var target_defaults = {
      table: "default",
      selectColumns: ["*"],
      whereClauses: [],
      orderBy: "time",
      orderType: "ASC"
    };
    _.defaults(this.target, target_defaults);

    var orderTypes = ["ASC", "DESC"];

    this.orderTypes = _.map(orderTypes, this.uiSegmentSrv.newSegment);
    this.orderTypeSegment = this.uiSegmentSrv.newSegment(this.target.orderType);
    this.orderBySegment = this.uiSegmentSrv.newSegment(this.target.orderBy);
    this.tableSegment = this.uiSegmentSrv.newSegment(this.target.table);
    this.selectColumnSegments = _.map(this.target.selectColumns, this.uiSegmentSrv.newSegment);
    this.whereSegments = _.map(this.target.whereClauses, this.uiSegmentSrv.newSegment);

    this.fixSelectColumnSegments();
    this.fixSegments(this.whereSegments);

    this.removeWhereSegment = uiSegmentSrv.newSegment({fake: true, value: '-- remove --'});
  }

  crateQuery(query) {
    return this.datasource._sql_query(query).then(response => {
      return response.data.rows;
    });
  }

  buildQuery() {
    this.target.query = queryBuilder.buildQuery(this.target);
    this.onChangeInternal();
  }

  // Event handlers
  onChangeInternal() {
    this.panelCtrl.refresh(); // Asks the panel to refresh data.
  }

  tableChanged() {
    this.target.table = this.tableSegment.value;
    this.buildQuery();
  }

  columnSegmentChanged(segment, index) {
    if (segment.type === 'plus-button') {
      segment.type = undefined;
      this.selectColumnSegments.push(this.uiSegmentSrv.newPlusButton());
    }
    this.target.selectColumns = _.map(_.filter(this.selectColumnSegments, segment => {
      return segment.type !== 'plus-button';
    }), 'value');
    this.buildQuery();
  }

  orderByChanged() {
    this.target.orderBy = this.orderBySegment.value;
    this.target.orderType = this.orderTypeSegment.value;
    this.buildQuery();
  }

  toggleEditorMode() {
    this.target.rawQuery = !this.target.rawQuery;
  }

  // Query suggestions
  getTables() {
    var self = this;
    return this.crateQuery(queryBuilder.getTables())
      .then(rows => {
        return self.transformToSegments(rows);
      });
  }

  getColumns() {
    var self = this;
    return this.crateQuery(queryBuilder.getColumns(this.tableSegment.value))
      .then(rows => {
        return self.transformToSegments(rows);
      });
  }

  getValues(column, limit=10) {
    var self = this;
    return this.crateQuery(queryBuilder.getValues(this.tableSegment.value, column, limit))
      .then(rows => {
        return self.transformToSegments(rows);
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
        columns.splice(0, 0, angular.copy(this.removeWhereSegment));
        return columns;
      });
    }
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
        whereClauses.push({condition: '', left: '', operator: '', right: ''});
      }
      if (segments[i].type === 'condition') {
        whereClauses[whereIndex].condition = segments[i].value;
      } else if (segments[i].type === 'key') {
        whereClauses[whereIndex].left = segments[i].value;
      } else if (segments[i].type === 'operator') {
        whereClauses[whereIndex].operator = segments[i].value;
      } else if (segments[i].type === 'value') {
        whereClauses[whereIndex].right = segments[i].value;
        whereIndex++;
      }
      i++;
    }
  }

  getOrderByColumns() {
    return this.$q.when(this.selectColumnSegments);
  }

  getOrderTypes() {
    var orderTypes = ["ASC", "DESC"];
    return this.$q.when(this.transformToSegments(orderTypes));
  }

  fixSelectColumnSegments() {
    var count = this.selectColumnSegments.length;
    var lastSegment = this.selectColumnSegments[Math.max(count-1, 0)];

    if (!lastSegment || lastSegment.type !== 'plus-button') {
      this.selectColumnSegments.push(this.uiSegmentSrv.newPlusButton());
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

CrateDatasourceQueryCtrl.templateUrl = 'partials/query.editor.html';

