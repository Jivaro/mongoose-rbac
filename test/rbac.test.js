/* global describe,it,before,beforeEach,afterEach */

var expect = require('chai').expect
  , rbac = require('../')
  , common = require('./common')
  , Role = rbac.Role
  , User = common.User;

before(function (next) {
  common.setup('mongodb://localhost/rbac_test', next);
});

describe('roles and permissions:', function () {
  var henry;

  beforeEach(function (next) {
    common.loadFixtures(function (err) {
      if (err) return next(err);
      User.findOne({ username: 'henry' }).populate('roles').exec(function (err, user) {
        if (err) return next(err);
        henry = user;
        next();
      });
    });
  });

  afterEach(function (next) {
    common.reset(next);
  });

  describe('initialization:', function () {
    it('should batch create roles and permissions', function (next) {
      rbac.init({
        role1: [
          ['create', 'Post'],
          ['read', 'Post'],
          ['update', 'Post'],
          ['delete', 'Post']
        ],
        role2: [
          ['read', 'Post']
        ],
        role3: [
          ['read', 'Post'],
          ['update', 'Post']
        ]
      }, function (err, role1, role2, role3) {
        expect(err).to.not.exist;
        expect(role1.permissions).to.have.length(4);
        expect(role2.permissions).to.have.length(1);
        expect(role3.permissions).to.have.length(2);
        next();
      });
    });
  });

  it('should require a unique role name', function (next) {
    Role.create({ name: 'admin' }, function (err) {
      expect(err.message).to.equal('Role name must be unique');
      next();
    });
  });

  it('should add a role to a model', function (next) {
    henry.addRole('admin').then(function () {
      //expect(err).to.not.exist;

      expect(henry.roles).to.have.length(1);
      Role.findOne({ name: 'admin' }, function (err, role) {
        expect(henry.roles[0].equals(role._id)).to.be.ok;

        next();
      });
    }, next);
  });

  it('should remove a role from a model', function (next) {
    henry.addRole('admin').then(function (err) {

      henry.removeRole('admin').then(function (err) {
        expect(err).to.not.exist;
        expect(henry.roles).to.be.empty;
        next();
      });
    }, next);
  });

  it('should indicate whether a model has a given role', function (next) {
    expect(henry.roles).to.be.empty;
    henry.hasRole('admin').then(function (hasAdminRole) {
      expect(hasAdminRole).to.equal(false);
      henry.addRole('admin').then(function () {

        henry.hasRole('admin').then(function (hasAdminRole) {

          expect(hasAdminRole).to.equal(true);
          next();
        });
      });
    }).catch(next);
  });

  it('should indicate whether a model has a given role when roles are populated', function (next) {
    henry.addRole('admin').then(function () {

      henry.can('create', 'Post').then(function (can) {
        //expect(err).to.not.exist;

        expect(can).to.equal(true);
        henry.hasRole('admin').then(function (isAdmin) {
          //expect(err).to.not.exist;
          expect(isAdmin).to.equal(true);
          next();
        });
      });
    }).catch(next);
  });

  it('should indicate whether a model has a given permission', function (next) {
    henry.addRole('readonly').then(function (err) {
      //expect(err).to.not.exist;
      henry.can('read', 'Post').then(function (canReadPost) {
        //expect(err).to.not.exist;
        expect(canReadPost).to.equal(true);
        henry.can('create', 'Post').then(function (canCreatePost) {
          //expect(err).to.not.exist;
          expect(canCreatePost).to.equal(false);
          next();
        });
      });
    }).catch(next);
  });

  it('should indicate whether a model has all of a given set of permissions', function (next) {
    henry.addRole('readonly').then(function (err) {
      //expect(err).to.not.exist;
      henry.canAll([['read', 'Post'], ['read', 'Comment']]).then(function (canRead) {

        expect(canRead).to.equal(true);
        henry.canAll([['read', 'Post'], ['create', 'Post']]).then(function (canReadAndCreate) {

          expect(canReadAndCreate).to.equal(false);
          next();
        });
      });
    }).catch(next);
  });

  it('should indicate whether a model has any of a given set of permissions', function (next) {
    henry.addRole('readonly').then(function () {
      //expect(err).to.not.exist;
      henry.canAny([['read', 'Post'], ['create', 'Post']]).then(function (canReadOrCreate) {
        //expect(err).to.not.exist;
        expect(canReadOrCreate).to.equal(true);
        next();
      });
    });
  });

  it('should be able to add multiple roles', function (next) {
    henry.addRole('admin').then(function (err) {
      //expect(err).to.not.exist;
      expect(henry.roles).to.have.length(1);
      henry.addRole('readonly').then(function (err) {
        //expect(err).to.not.exist;
        expect(henry.roles).to.have.length(2);
        next();
      });
    });
  });
});
