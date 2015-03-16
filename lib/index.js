var mongoose = require('mongoose'),
  async = require('async'),
  CAN_ALL = 'all',
  CAN_ANY = 'any',
  PermissionSchema, Permission, RoleSchema, Role;

var Promise = require('native-or-bluebird');

PermissionSchema = mongoose.Schema({
  subject: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true
  },
  displayName: String,
  description: String
});

PermissionSchema.statics.findOrCreate = function(params, callback) {
  var that = this;

  function findOrCreateOne(params, callback) {
    that.findOne(params, function(err, permission) {
      if (err) return callback(err);
      if (permission) return callback(null, permission);
      that.create(params, callback);
    });
  }

  if (Array.isArray(params)) {
    var permissions = [];
    async.forEachSeries(params, function(param, next) {
      findOrCreateOne(param, function(err, permission) {
        permissions.push(permission);
        next(err);
      });
    }, function(err) {
      callback.apply(null, [err].concat(permissions));
    });
  } else {
    findOrCreateOne(params, callback);
  }
};

RoleSchema = mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  displayName: String,
  description: String,
  permissions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permission'
  }]
});

RoleSchema.methods.can = function(action, subject) {
  var self = this;
  return new Promise(function(resolve, reject) {
    mongoose.model('Role').findById(self._id, function(err, role) {
      if (err) return reject(err);
      doCan.call(role, CAN_ALL, [
        [action, subject]
      ]).then(resolve, reject);
    });
  });

};

RoleSchema.methods.canAll = function(actionsAndSubjects) {
  var self = this;
  return new Promise(function(resolve, reject) {
    mongoose.model('Role').findById(self._id, function(err, role) {
      if (err) return reject(err);
      doCan.call(role, CAN_ALL, actionsAndSubjects).then(resolve, reject);
    });
  });

};

RoleSchema.methods.canAny = function(actionsAndSubjects) {
  var self = this;
  return new Promise(function(resolve, reject) {
    mongoose.model('Role').findById(self._id, function(err, role) {
      if (err) return reject(err);
      doCan.call(role, CAN_ANY, actionsAndSubjects).then(resolve, reject);
    });
  });

};

RoleSchema.pre('save', function(done) {
  var that = this;
  mongoose.model('Role').findOne({
    name: that.name
  }, function(err, role) {
    if (err) {
      done(err);
    } else if (role && !(role._id.equals(that._id))) {
      that.invalidate('name', 'name must be unique');
      done(new Error('Role name must be unique'));
    } else {
      done();
    }
  });
});

function doCan(type, actionsAndSubjects) {
  var role = this;

  return new Promise(function(resolve, reject) {

    role.populate('permissions', function(err, role) {
      if (err) return reject(err);

      var count = 0,
        hasAll = false;

      if (role.permissions) {
        actionsAndSubjects.forEach(function(as) {
          var has = false;
          role.permissions.forEach(function(p) {
            if (p.action === as[0] && p.subject === as[1]) has = true;
          });
          if (has) count++;
        });
      }

      if (type === CAN_ANY) {
        hasAll = (count > 0);
      } else {
        hasAll = (count === actionsAndSubjects.length);

      }

      resolve(hasAll);

    });
  });

}

function resolveRole(role) {
  return new Promise(function(resolve, reject) {
    if (typeof role === 'string') {
      mongoose.model('Role').findOne({
        name: role
      }, function(err, role) {
        if (err) return reject(err);
        if (!role) return reject(new Error("Unknown role"));
        resolve(role);
      });
    } else {
      resolve(role);
    }
  });

}

function plugin(schema, options) {
  options || (options = {});

  schema.add({
    roles: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role'
    }]
  });

  schema.methods.hasRole = function(role) {
    var obj = this;

    return resolveRole(role).then(function(role) {
      var hasRole = false;
      obj.roles.forEach(function(existing) {
        if ((existing._id && existing._id.equals(role._id)) ||
          (existing.toString() === role.id)) {
          hasRole = true;
        }
      });
      return hasRole;
    });

  };

  schema.methods.addRole = function(role) {
    var obj = this;

    return resolveRole(role).then(function(r) {
      role = r;
      return obj.hasRole(role);
    }).then(function(has) {
      if (has) return obj;

      obj.roles = [role._id].concat(obj.roles);

      return new Promise(function(resolve, reject) {
        obj.save(function(err, obj) {

          if (err) return reject(err);
          resolve(obj);
        });
      });

    });
    /*
    return new Promise(function(resolve, reject) {
      resolveRole(role, function(err, role) {
        if (err) return reject(err);
        obj.hasRole(role).then(function(err, has) {
          if (err) return reject(err);
          if (has) return resolve(obj);
          obj.roles = [role._id].concat(obj.roles);
          obj.save(function(err, obj) {
            if (err) return reject(err);
            resolve(obj);
          });
        });
      });
    });*/

  };

  schema.methods.removeRole = function(role) {
    var obj = this;

    return resolveRole(role).then(function(r) {
      role = r;
      return obj.hasRole(role.name);
    }).then(function(has) {
      if (!has) return;
      var index = obj.roles.indexOf(role._id);
      obj.roles.splice(index, 1);

      return new Promise(function(resolve, reject) {
        obj.save(function(err) {
          if (err) return reject(err);
          resolve();
        });
      });

    });
    /*
    return new Promise(function(resolve, reject) {
      resolveRole(role, function(err, role) {
        obj.hasRole(role.name).then(function(err, has) {
          if (err) return reject(err);
          if (!has) return resolve(null);
          var index = obj.roles.indexOf(role._id);
          obj.roles.splice(index, 1);
          obj.save(function(err) {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });*/

  };

  schema.methods.can = function(action, subject) {
    var obj = this;

    return new Promise(function(resolve, reject) {
      obj.populate('roles', function(err, obj) {
        if (err) return reject(err);
        var hasPerm = false;
        if (obj.roles) {

          async.forEachSeries(obj.roles, function(role, next) {

            role.can(action, subject).then(function(has) {

              if (has) hasPerm = true;
              next();
            }, next);
          }, function(err) {

            if (err) return reject(err);

            resolve(hasPerm);
          });
        } else {
          resolve(hasPerm);
        }
      });
    });

  };

  schema.methods.canAll = function(actionsAndSubjects) {
    var obj = this;

    return new Promise(function(resolve, reject) {
      obj.populate('roles', function(err, obj) {
        if (err) return reject(err);
        var count = 0,
          hasAll = false;
        if (obj.roles) {

          async.forEachSeries(actionsAndSubjects, function(as, nextPerm) {
            var found = false;
            async.forEachSeries(obj.roles, function(role, nextRole) {
              role.can(as[0], as[1]).then(function(has) {

                if (!found && has) {
                  found = true;
                  count++;
                }
                nextRole();
              }, nextRole);
            }, nextPerm);
          }, function(err) {
            if (err) return reject(err);
            hasAll = (count === actionsAndSubjects.length);
            resolve(hasAll);
          });
        } else {
          resolve(hasAll);
        }
      });
    });

  };

  schema.methods.canAny = function(actionsAndSubjects) {
    var obj = this;
    return new Promise(function(resolve, reject) {
      obj.populate('roles', function(err, obj) {
        if (err) return reject(err);
        var hasAny = false;
        if (obj.roles) {
          var iter = 0;
          async.until(
            function() {
              return hasAny || iter === obj.roles.length;
            },
            function(callback) {
              obj.roles[iter].canAny(actionsAndSubjects).then(function(has) {
                if (has) hasAny = true;
                iter++;
                callback();
              }, callback);
            },
            function(err) {

              if (err) return reject(err);
              
              resolve(hasAny);
            });
        } else {
          resolve(hasAny);
        }
      });
    });

  };
}

function init(rolesAndPermissions, done) {
  var count = Object.keys(rolesAndPermissions).length,
    roles = [],
    promise = new mongoose.Promise(done);
  for (var name in rolesAndPermissions) {
    var len, role;
    // Convert [action, subject] arrays to objects
    len = rolesAndPermissions[name].length;
    for (var i = 0; i < len; i++) {
      if (Array.isArray(rolesAndPermissions[name][i])) {
        rolesAndPermissions[name][i] = {
          action: rolesAndPermissions[name][i][0],
          subject: rolesAndPermissions[name][i][1]
        };
      }
    }
    // Create role
    role = new Role({
      name: name
    });
    roles.push(role);
    role.save(function(err, role) {
      if (err) return promise.error(err);
      // Create role's permissions if they do not exist
      Permission.findOrCreate(rolesAndPermissions[role.name], function(err) {
        if (err) return promise.error(err);
        // Add permissions to role
        role.permissions = Array.prototype.slice.call(arguments, 1);
        // Save role
        role.save(function(err) {
          if (err) return promise.error(err);
          --count || done.apply(null, [err].concat(roles));
        });
      });
    });
  }
}

module.exports.Permission = Permission = mongoose.model('Permission', PermissionSchema);
module.exports.Role = Role = mongoose.model('Role', RoleSchema);
module.exports.plugin = plugin;
module.exports.init = init;
