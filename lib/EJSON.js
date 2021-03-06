var ZSchema = require('z-schema')
var _ = require('lodash')
var EJSON = require('mongodb-extended-json')
var mongodb = require('leafnode').mongodb

/******************************************************************************
 * EJSON
 *
 * https://docs.mongodb.com/manual/reference/mongodb-extended-json/
 * 
 * EJSON types we support:
 * - Date
 * - DBRef
 * - MaxKey
 * - MinKey
 * - Long (aka NumberLong)
 * - ObjectId
 * - Regex
 * - Timestamp
 * - Undefined
 * 
 * EJSON types we do not support:
 * - Binary
 * 
 * EJSON types suggested to exist via the Node.js mongodb driver but that 
 * do not see like official EJSON. We do not support these:
 * - Code
 * - Decimal128
 * - Double
 * - Map
 * - Symbol
 *
 */
module.exports = {

  /**********************************************************************
   * types
   */     
  types: {
    Date: Date,
    DBRef: mongodb.DBRef,
    MaxKey: mongodb.MaxKey,
    MinKey: mongodb.MinKey,
    Long: mongodb.Long,
    ObjectId: mongodb.ObjectId,
    Regex: RegExp,
    Timestamp: mongodb.Timestamp
  },

  /**********************************************************************
   * ejsonSchemas
   */       
  ejsonSchemas: {
    Date: { 
      type: 'object',
      required: ['$date'],
      properties: {
        '$date' : { type: 'string' }
      },
      additionalProperties: false
    },
    DBRef: { 
      type: 'object',
      required: ['$ref'],
      properties: {
        '$ref': { type: 'string' },
        '$id': {} // XXX not sure about this -- want any type
      },
      additionalProperties: false
    },
    MaxKey: { 
      type: 'object',
      required: ['$maxKey'],
      properties: {
        '$maxKey': { type: 'number', minimum: 1, maximum: 1 }
      },
      additionalProperties: false
    },
    MinKey: { 
      type: 'object',
      required: ['$minKey'],
      properties: {
        '$minKey': { type: 'number', minimum: 1, maximum: 1 }
      },
      additionalProperties: false
    },
    Long: { 
      type: 'object',
      required: ['$numberLong'],
      properties: {
        '$numberLong': { type: 'string' }
      },
      additionalProperties: false
    },    
    ObjectId: { 
      type: 'object',
      required: ['$oid'],
      properties: {
        '$oid' : { type: 'string' }
      },
      additionalProperties: false
    },
    Regex: { 
      type: 'object',
      required: ['$regex'],
      properties: {
        '$regex' : { type: 'string' },
        '$options': { type: 'string' }
      },
      additionalProperties: false
    },
    Timestamp: { 
      type: 'object',
      required: ['$timestamp'],
      properties: {
        '$timestamp' : { 
          type: 'object',
          properties: {
            t: { type: 'number' },
            i: { type: 'number' }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    },
    Undefined: { 
      type: 'object',
      required: ['$undefined'],
      properties: {
        '$undefined': { type: 'boolean' }
      },
      additionalProperties: false
    },
  },

  /**********************************************************************
   * isDate
   */
  isDate: function(obj) {
    return obj instanceof Date
  },

  /**********************************************************************
   * isDBRef
   */
  isDBRef: function(obj) {
    return obj._bsontype === 'DBRef'
  },

  /**********************************************************************
   * isMaxKey
   */
  isMaxKey: function(obj) {
    return obj._bsontype === 'MaxKey'
  },

  /**********************************************************************
   * isMinKey
   */
  isMinKey: function(obj) {
    return obj._bsontype === 'MinKey'
  },

  /**********************************************************************
   * isLong
   */
  isLong: function(obj) {
    return obj._bsontype === 'Long'
  },

  /**********************************************************************
   * isObjectId
   */
  isObjectId: function(obj) {
    return obj._bsontype === 'ObjectID' // Note ID vs Id. They now support both but just one _bsontype.
  },

  /**********************************************************************
   * isRegex
   */
  isRegex: function(obj) {
    return obj instanceof RegExp
  },

  /**********************************************************************
   * isTimestamp
   */
  isTimestamp: function(obj) {
    return obj._bsontype === 'Timestamp'
  },

  /**********************************************************************
   * isUndefined
   */
  isUndefined: function(obj) {
    return obj === undefined
  },

  /**********************************************************************
   * serialize
   */      
  serialize: function(ejson) {
    return EJSON.serialize(ejson)
  },

  /**********************************************************************
   * deserialize
   */      
  deserialize: function(ejson) {
    return EJSON.deserialize(ejson)
  },

  /**********************************************************************
   * parse
   */      
  parse: function(str) {
    return EJSON.parse(str)
  },

  /**********************************************************************
   * stringify
   */      
  stringify: function(str) {
    return EJSON.stringify(str)
  },

  /**********************************************************************
   * coerce
   */      
  coerce: function(obj, schema) {
    var self = this

    // If there is no schema we are done. We won't have enough info to coerce. Return original obj.
    if (!schema) {
      return obj
    }

    // array case - recurse
    if (_.isArray(obj)) {
      return _.map(obj, function(v) { // recurse on array and schema together
        return self.coerce(v, schema && schema.items) 
      })
    } 
  
    // object case - resurse
    if (_.isObjectLike(obj)) { 
      return _.mapValues(obj, function(v, k) { // recurse on obj and schema together
        return self.coerce(v, schema && schema.properties && schema.properties[k])
      })
    } 

    // string case. Here we do the actual coercion.
    if (typeof(obj) === 'string') { 
      var schemaType = schema.type
      if (schemaType) {
        // numbers and booleans
        if (schemaType === 'number' || schemaType === 'integer' || schemaType === 'boolean') {
          return JSON.parse(obj)
        }
        
        // ObjectId
        if (schemaType === 'ObjectId') {
          return EJSON.deserialize({ $oid: obj })
        }
        
        // Date
        if (schemaType === 'Date') {
          return EJSON.deserialize({ $date: obj })
        }
      }
    }
  
    // If it is not an object, array, or string, we can just return the original obj.
    return obj
  },

  /**********************************************************************
   * validate
   */       
  validate: function(obj, schema) {
    var options = {}
    var validator = new ZSchema(options)

    schema = this.toJSONSchema(schema)
    
    var result = {}
    try {
      var isSchemaValid = validator.validateSchema(schema)
      if (!isSchemaValid) {
        throw new Error("Invalid schema.")
      }
      result.valid = validator.validate(obj, schema)
    } catch (e) {
      throw new Error("Exception in compiling schema or validating ejson schema: " + 
                      EJSON.stringify(schema) +
                      " data: " + EJSON.stringify(obj) +
                      " -- Reason: " + e.message)
    }
    if (!result.valid) {
      result.error = validator.getLastErrors()[0].message
    }

    return result
  },

  /**********************************************************************
   * toJSONSchema
   */       
  toJSONSchema: function(schema) {
    var self = this

    if (_.isArray(schema)) {
      return _.map(schema, function(elem) {
        return self.toJSONSchema(elem)
      })
    }

    if (_.isObjectLike(schema)) {
      if (schema.type) {
        var schemaReplacement = self.ejsonSchemas[schema.type]
        if (schemaReplacement) {
          return schemaReplacement
        }
      }
      return _.mapValues(schema, function(v, k) {
        return self.toJSONSchema(v)
      })
    }

    return schema
  },

  
}

