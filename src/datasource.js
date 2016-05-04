import _ from 'lodash';
import * as response_handler from './response_handler';

export class CrateDatasource {

  constructor(instanceSettings, $q, backendSrv) {
    this.type = instanceSettings.type;
    this.url = instanceSettings.url;
    this.name = instanceSettings.name;
    this.q = $q;
    this.backendSrv = backendSrv;
  }

  // Called once per panel (graph)
  query(options) {
    var query = _.find(options.targets, target => {
      return target.query !== '';
    }).query;

    if (query.length <= 0) {
      return this.q.when([]);
    }

    return this._sql_query(query).then(response_handler.handle_response);
  }

  // Required
  // Used for testing datasource in datasource configuration pange
  testDatasource() {
    return this.backendSrv.datasourceRequest({
      url: this.url + '/',
      method: 'GET'
    }).then(response => {
      if (response.status === 200) {
        var cluster_name = response.data.cluster_name;
        var crate_version = response.data.version.number;
        return {
          status: "success",
          message: "Cluster: " + cluster_name + ", version: " + crate_version,
          title: "Success"
        };
      }
    });
  }

  _sql_query(query) {
    return this.backendSrv.datasourceRequest({
      url: this.url + '/_sql',
      data: {
        "stmt": query
      },
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

}
