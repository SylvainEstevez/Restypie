'use strict';

/***********************************************************************************************************************
 * Dependencies
 **********************************************************************************************************************/
const _ = require('lodash');

const Restypie = require('../../');
const PermissionTypes = Restypie.PermissionTypes;

const AUTO_FILTERING_WEIGHT = Symbol('AUTO_FILTERING_WEIGHT');
const MAX_FILTERING_WEIGHT = 100;
const MIN_FILTERING_WEIGHT = 1;


/***********************************************************************************************************************
 * Abstract class for fields.
 *
 * @namespace Restypie.Fields
 * @class AbstractField
 * @constructor
 * @param {String} key Public key for the field, to be manipulated through the APIs.
 * @param {Object} options
 * @param {String} [options.path = key] Internal path of the field (might be different than the exposed/public `key`).
 * @param {Boolean} [options.isRequired = false] Is the field required ? If `true`, `isWritable` will also be
 * automatically set to true to stay consistent.
 * @param {Boolean} [options.isReadable = false] Defines whether or not the field can be read/selected.
 * @param {Boolean} [options.isWritable = false] Defines whether or not the field can be written.
 * @param {Boolean} [options.isFilterable = false] Defines whether or not the field can be filtered/sorted. If `true`,
 * `isReadable` will also be set to `true` to stay consistent.
 * @param {Boolean} [options.isWritableOnce = false] Defines whether or not the field can be updated once written. Be
 * careful that setting this prop to `true` will also set `isWritable` and `isRequired` to true in order to force the
 * first write.
 **********************************************************************************************************************/
module.exports = class AbstractField {

  get isRelation() { return false; }

  get hasTo() { return this._hasTo; }

  get hasThrough() { return this._hasThrough; }

  get supportedOperators() { return [Restypie.Operators.Eq]; }

  get optionsProperties() { return []; }

  get fromKey() {
    return _.isString(this._fromKey) ? this._fromKey : this.key;
  }

  get toKey() {
    return this._toKey;
  }

  get isDynamicRelation() {
    return this._isDynamicRelation;
  }

  get filteringWeight() { return this._filteringWeight; }

  get normalizedFilteringWeight() { return (this._filteringWeight || MIN_FILTERING_WEIGHT) / 100; }

  /**
   * @constructor
   */
  constructor(key, options) {
    Restypie.Utils.forceAbstract(this, AbstractField, true);

    options = options || {};

    this.key = key;
    this.path = options.path || key;
    this.isRequired = !!options.isRequired;
    this.isWritable = !!options.isWritable;
    this.isFilterable = !!options.isFilterable;
    this.isReadable = !!options.isReadable;
    this.isWritableOnce = !!options.isWritableOnce;
    this.isPrimaryKey = !!options.isPrimaryKey;
    this.isPopulable = !!options.isPopulable;
    this.isOneToOneRelation = !!options.isOneToOneRelation;

    // Let's stay consistent - DO NOT change the order of those declarations
    if (this.isWritableOnce && !('isRequired' in options)) this.isRequired = true;
    if (this.isRequired) this.isWritable = true;
    if (this.isPrimaryKey && !options.hasOwnProperty('isFilterable')) this.isFilterable = true;
    if (this.isPrimaryKey && !this.isFilterable) {
      Restypie.Logger.warn(`isPrimaryKey implies isFilterable for key ${this.key}`);
    }
    if (this.isFilterable) this.isReadable = true;
    this.isUpdatable = this.isWritableOnce ? false : this.isWritable;

    if ('filteringWeight' in options) this.setFilteringWeight(options.filteringWeight);
    else this.setFilteringWeight(AUTO_FILTERING_WEIGHT);

    if (options.hasOwnProperty('default')) {
      this.hasDefault = true;
      this.default = options.default;
    }

    if (options.hasOwnProperty('to')) {
      this._hasTo = true;
      this.isPopulable = true;
      this._to = options.to;
      this._toKey = options.toKey;
      this._fromKey = options.fromKey;
      this._isDynamicRelation = !!options.isDynamicRelation;

      if (options.hasOwnProperty('through')) {
        this._hasThrough = true;
        this._through = options.through;
        this.throughKey = options.throughKey;
        this.otherThroughKey = options.otherThroughKey;
        if (!this.throughKey) throw new Error('ManyToMany relation defined without a `throughKey`');
        if (!this.otherThroughKey) throw new Error('ManyToMany relation defined without a `otherThroughKey`');
      }
    }

    if (options.hasOwnProperty('canRead')) {
      this._canReadField = options.canRead;
    }
    if (options.hasOwnProperty('canWriteOnCreate')) {
      this._canWriteOnCreateField = options.canWriteOnCreate;
    }
    if (options.hasOwnProperty('canWriteOnUpdate')) {
      this._canWriteOnUpdateField = options.canWriteOnUpdate;
    }
  }

  setFilteringWeight(weight) {
    if (weight === AUTO_FILTERING_WEIGHT) {
      this.setFilteringWeight(this.isPrimaryKey ? MAX_FILTERING_WEIGHT : MIN_FILTERING_WEIGHT);
    } else {
      if (!Restypie.Utils.isValidNumber(weight)) {
        throw new Error(`filteringWeight must be a valid number, got ${weight}`);
      }
      if (weight < MIN_FILTERING_WEIGHT || weight > MAX_FILTERING_WEIGHT) {
        throw new Error(`filteringWeight must be at least ${MIN_FILTERING_WEIGHT} and ${MAX_FILTERING_WEIGHT} at most`);
      }
      this._filteringWeight = weight;
    }
  }

  /**
   * Checks whether or not the field is present, meaning not `null`, nor `undefined`.
   *
   * @method isPresent
   * @param {*} value
   * @return {Boolean}
   */
  isPresent(value) {
    return !Restypie.Utils.isNone(AbstractField.toJavascriptValue(value));
  }

  /**
   * Validates that `value` `isPresent()`.
   *
   * **Throws:**
   * - `Restypie.TemplateErrors.Missing`: If the field is required but `null` of `undefined`.
   *
   * @method validatePresence
   * @param {*} value
   * @return {Boolean}
   */
  validatePresence(value) {
    let isPresent = this.isPresent(value);
    if (this.isRequired && !isPresent) throw new Restypie.TemplateErrors.Missing({ key: this.key, value });
    return isPresent;
  }

  /**
   * Turns `value` into its internal value.
   *
   * @method hydrate
   * @param {*} value
   * @return {*}
   */
  hydrate(value) {
    value = AbstractField.toJavascriptValue(value);
    if (!this.isPresent(value) && this.hasDefault) value = this.default;
    return value;
  }

  /**
   * Turns `value` into its public value.
   *
   * @method dehydrate
   * @param {*} value
   * @return {*} value
   */
  dehydrate(value) {
    return value;
  }

  /**
   * Validates `value` and provides a list of validation errors.
   *
   * @method validate
   * @param {*} value
   */
  validate() {
    return true;
  }

  getToKey() {
    return _.isString(this._toKey) ? this._toKey : this.getToResource.apply(this, arguments).primaryKeyField.key;
  }

  getToResource() {
    return (!this._to || this._to instanceof Restypie.Resources.AbstractCoreResource) ?
      this._to :
      this._to.apply(null, arguments);
  }

  getThroughResource() {
    return (!this._through || this._through instanceof Restypie.Resources.AbstractCoreResource) ?
      this._through :
      this._through.apply(null, arguments);
  }

  /**
   * Returns the supported operator that corresponds to `operatorName`, if any.
   *
   * @method getOperatorByName
   * @param {String} operatorName
   * @return {Restypie.Operators.AbstractOperator | undefined}
   */
  getOperatorByName(operatorName) {
    for (let operator of this.supportedOperators) {
      if (operator.stringName === operatorName) return operator;
    }
  }

  /**
   * Checks for read permission on the field. Override or pass in constructor options
   * this method for field level authentication. Defaults to true otherwise
   *
   * @method canRead
   * @param bundle
   * @returns {Promise.<boolean>}
   */
  canRead(bundle) {
    if (this._canReadField) {
      return Promise.resolve(this._canReadField.call(null, bundle));
    }
    return Promise.resolve(true);
  }

  /**
   * Checks for create permission on the field. Override or pass in constructor options
   * this method for field level authentication. Defaults to true otherwise
   *
   * @method canWriteOnCreate
   * @param bundle
   * @returns {Promise.<boolean>}
   */
  canWriteOnCreate(bundle) {
    if (this._canWriteOnCreateField) {
      return Promise.resolve(this._canWriteOnCreateField.call(null, bundle));
    }
    return Promise.resolve(true);
  }

  /**
   * Checks for update permission on the field. Override or pass in constructor options
   * this method for field level authentication. Defaults to true otherwise
   *
   * @method canWriteOnUpdate
   * @param bundle
   * @returns {Promise.<boolean>}
   */
  canWriteOnUpdate(bundle) {
    if (this._canWriteOnUpdateField) {
      return Promise.resolve(this._canWriteOnUpdateField.call(null, bundle));
    }
    return Promise.resolve(true);
  }

  /**
   * Rejects the request by throwing if canRead returns false
   *
   * @param bundle
   * @returns {Promise.<boolean>}
   * @private
   */
  _canRead(bundle) {
    return Promise.resolve(this.canRead(bundle))
      .then(result => {
        if (!result) {
          return Promise.reject(new Restypie.TemplateErrors.FieldNotReadable({
            key: this.key
          }));
        }
        return Promise.resolve(result);
      });
  }

  /**
   * Rejects the request by throwing if canWriteOnCreate returns false
   *
   * @param bundle
   * @returns {Promise.<boolean>}
   * @private
   */
  _canWriteOnCreate(bundle) {
    return Promise.resolve(this.canWriteOnCreate(bundle))
      .then(result => {
        if (!result) {
          return Promise.reject(new Restypie.TemplateErrors.FieldNotWritable({
            key: this.key
          }));
        }
        return Promise.resolve(result);
      });
  }

  /**
   * Rejects the request by throwing if canWriteOnUpdate returns false
   *
   * @param bundle
   * @returns {Promise.<boolean>}
   * @private
   */
  _canWriteOnUpdate(bundle) {
    return Promise.resolve(this.canWriteOnUpdate(bundle))
      .then(result => {
        if (!result) {
          return Promise.reject(new Restypie.TemplateErrors.FieldNotUpdatable({
            key: this.key
          }));
        }
        return Promise.resolve(result);
      });
  }

  /**
   * Checks for all permissions requested for the field
   *
   * @param requestedPermissions
   * @param bundle
   * @returns {Promise.<boolean>}
   */
  authenticatePermissions(requestedPermissions, bundle) {
    return Promise.all(requestedPermissions.map(perm => {
      let permissionPromise;
      switch (perm) {
        case PermissionTypes.READ:
          permissionPromise = this._canRead(bundle);
          break;
        case PermissionTypes.CREATE:
          permissionPromise = this._canWriteOnCreate(bundle);
          break;
        case PermissionTypes.UPDATE:
          permissionPromise = this._canWriteOnUpdate(bundle);
          break;
        default:
          const supported = [PermissionTypes.READ, PermissionTypes.CREATE, PermissionTypes.UPDATE];
          permissionPromise = Promise.reject(new Restypie.TemplateErrors.UnsupportedPermission({
            expected: supported,
            value: perm
          }));
      }
      return permissionPromise;
    })).then(() => {
      return Promise.resolve(true);
    }, reason => {
      return Promise.reject(reason);
    });
  }

  static get AUTO_FILTERING_WEIGHT() { return AUTO_FILTERING_WEIGHT; }
  static get MAX_FILTERING_WEIGHT() { return MAX_FILTERING_WEIGHT; }
  static get MIN_FILTERING_WEIGHT() { return MIN_FILTERING_WEIGHT; }

  /**
   * Turns `"null"` and `"undefined"` into `null` and `undefined`, otherwise lets `value` untouched.
   *
   * @method toJavascriptValue
   * @static
   * @param {*} value
   * @return {*}
   */
  static toJavascriptValue(value) {
    return value === 'null' ? null :
      value === 'undefined' ? undefined :
        value;
  }
};
