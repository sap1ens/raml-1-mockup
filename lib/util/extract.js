var _ = require('./helpers');

var id = 0;

function hash() {
  return 'schema_' + (id++);
}

function parse(json, path) {
  try {
    return JSON.parse(json);
  } catch (e) {
    if (!json) {
      throw new Error('empty JSON string on ' + path);
    }

    throw new Error(e.message + ' on ' + path + ' (' + json + ')');
  }
}

function findType(schema, typeName) {
  if(!schema.types) return;

  for(var i = 0; i < schema.types.length; i++) {
    var type = schema.types[i];
    if(type[typeName]) {
      return type[typeName];
    }
  }
}

function reduce(schema, parent, fullSchema) {
  var _resources = schema.resources || [];
  var retval = {};

  _.each(_resources, function(resource) {
    var parts = parent.concat([resource.relativeUri]);
    var _methods = resource.methods || [];

    _.each(_methods, function(method) {
      var _responses = method.responses || [];

      _.each(_responses, function(response) {
        var _status = response.code;
        var _body = response.body;
        var route = parts.join('');

        if (!retval[route]) {
          retval[route] = {};
        }

        _.each(_body, function(body) {
          if (!body.schemaContent) {
            body.schemaContent = body.schema && body.schema[0];
          }

          if (!retval[route][method.method]) {
            retval[route][method.method] = {};
          }

          var fixed_path = method.method.toUpperCase() + ' ' + route;
          var fixed_schema;

          if (body.schemaContent) {
            fixed_schema = body.schemaContent.charAt() === '{'
              ? parse(body.schemaContent, fixed_path)
              : body.schemaContent;
          }

          var type_name = body.type[0];
          var is_list_type = false;

          if(type_name == 'array') {
            type_name = body.items;
            is_list_type = true;
          }

          var type_def = type_name ? findType(fullSchema, type_name) : null;

          retval[route][method.method][_status] = {
            _ref: hash(),
            schema: fixed_schema || null,
            type: type_def,
            is_list_type: is_list_type,
            example: body.example || null
          };
        });
      });
    });

    if (resource.resources) {
      var re = reduce(resource, parts, fullSchema);

      for (var key in re) {
        retval[key] = re[key];
      }
    }
  });

  return retval;
}

module.exports = function(schema) {
  var res = reduce(schema, [], schema),
    definitions = {};

  var _schemas = {};

  _.each(schema.schemas || [], function(items) {
      _.each(items, function(item, key) {
        _schemas[key] = items[key];
      });
    });

  _.each(schema.types || [], function(items) {
      _.each(items, function(item) {
        _schemas[item.name] = item.type[0];
      });
    });

  _.each(res, function(methods, _path) {
    var _key = [_path];

    _.each(methods, function(responses, _method) {
      _key.unshift(_method.toUpperCase());

      _.each(responses, function(body, _status) {
        _key.push(_status);

        if (typeof body.schema === 'string') {
          body.schema = parse(_schemas[body.schema], _key.join(' ')) || null;
        }

        if (body.schema !== null && !definitions[body._ref]) {
          definitions[body._ref] = body.schema;
          delete body.schema;
        }
      });
    });
  });

  return {
    resources: res,
    definitions: definitions
  };
};
