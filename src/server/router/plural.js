var express = require('express')
var _ = require('lodash')
var pluralize = require('pluralize')
var utils = require('../utils')

module.exports = function (db, name) {

  // Create router
  var router = express.Router()

  // GET /:resource
  // GET /:resource?q=
  // GET /:resource?attr=&attr=
  // GET /:resource?_end=&*
  // GET /:resource?_start=&_end=&*
  function list (req, res, next) {

    // Filters list
    var filters = {}

    // Resource chain
    var chain = db(name).chain()

    // Remove q, _start, _end, ... from req.query to avoid filtering using those
    // parameters
    var q = req.query.q
    var _start = req.query._start
    var _end = req.query._end
    var _sort = req.query._sort
    var _order = req.query._order
    var _limit = req.query._limit
    delete req.query.q
    delete req.query._start
    delete req.query._end
    delete req.query._sort
    delete req.query._order
    delete req.query._limit

    if (q) {

      // Full-text search
      q = q.toLowerCase()

      chain = chain.filter(function (obj) {
        for (var key in obj) {
          var value = obj[key]
          if (db._.deepQuery(value, q)) {
            return true
          }
        }
      })

    }

    // Add query parameters filters
    // Convert query parameters to their native counterparts
    for (var key in req.query) {
      // don't take into account JSONP query parameters
      // jQuery adds a '_' query parameter too
      if (key !== 'callback' && key !== '_') {
        filters[key] = utils.toNative(req.query[key])
      }
    }

    // Filter
    if (!_(filters).isEmpty()) {
      for (var f in filters) {
        // This syntax allow for deep filtering using lodash (i.e. a.b.c[0])
        chain = chain.filter(f, filters[f])
      }
    }

    // Sort
    if (_sort) {
      _order = _order || 'ASC'

      chain = chain.sortBy(function (element) {
        return element[_sort]
      })

      if (_order === 'DESC') {
        chain = chain.reverse()
      }
    }

    // Slice result
    if (_end || _limit) {
      res.setHeader('X-Total-Count', chain.size())
      res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count')
    }

    _start = parseInt(_start, 10) || 0

    if (_end) {
      _end = parseInt(_end, 10)
      chain = chain.slice(_start, _end)
    } else if (_limit) {
      _limit = parseInt(_limit, 10)
      chain = chain.slice(_start, _start + _limit)
    }

    res.locals.data = chain.value()
    next()
  }

  // GET /:resource/:id
  function show (req, res, next) {
    var _embed = req.query._embed
    var id = utils.toNative(req.params.id)
    var resource = db(name)
      .getById(id)

    if (resource) {
      // Clone resource to avoid making changes to the underlying object
      resource = _.cloneDeep(resource)
      // Always use an array
      _embed = _.isArray(_embed) ? _embed : [_embed]

      // Embed other resources based on resource id
      _embed.forEach(function (otherResource) {

        if (otherResource
          && otherResource.trim().length > 0
          && db.object[otherResource]) {

          var query = {}
          var prop = pluralize.singular(name) + 'Id'
          query[prop] = id
          resource[otherResource] = db(otherResource).where(query)

        }
      })

      res.locals.data = resource
    }

    next()
  }

  // POST /:resource
  function create (req, res, next) {
    for (var key in req.body) {
      req.body[key] = utils.toNative(req.body[key])
    }

    var resource = db(name)
      .insert(req.body)

    res.status(201)
    res.locals.data = resource
    next()
  }

  // PUT /:resource/:id
  // PATCH /:resource/:id
  function update (req, res, next) {
    for (var key in req.body) {
      req.body[key] = utils.toNative(req.body[key])
    }

    var resource = db(name)
      .updateById(utils.toNative(req.params.id), req.body)

    if (resource) {
      res.locals.data = resource
    }

    next()
  }

  // DELETE /:resource/:id
  function destroy (req, res, next) {
    db(name).removeById(utils.toNative(req.params.id))

    // Remove dependents documents
    var removable = db._.getRemovable(db.object)

    _.each(removable, function (item) {
      db(item.name).removeById(item.id)
    })

    res.locals.data = {}
    next()
  }

  router.route('/')
    .get(list)
    .post(create)

  router.route('/:id')
    .get(show)
    .put(update)
    .patch(update)
    .delete(destroy)

  return router
}
