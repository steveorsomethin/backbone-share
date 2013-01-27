// Need to validate models
// Clean up parent/child reference cycles
// Need to handle connectivity on undo/redo
// List move?
// Removing listeners on ShareDocs isn't working

(function(){
	var root = this,
		Backbone = root.Backbone,
		sharejs = root.sharejs,
		_ = root._;

	Backbone.ShareLogger = console;

	var dmp = (function() {
		var diff_match_patch = this.diff_match_patch,
			DIFF_EQUAL = this.DIFF_EQUAL,
			DIFF_DELETE = this.DIFF_DELETE,
			DIFF_INSERT = this.DIFF_INSERT;

		var dmp = new diff_match_patch();
		return {
			getStringOps: function(str1, str2, basePath) {
				str1 = str1 || '';
				str2 = str2 || '';
				basePath = basePath || [];

				var diffs = dmp.diff_main(str1, str2),
					ops = [],
					position = 0;

				_.each(diffs, function(diff) {
					var type = diff[0], text = diff[1];

					switch (type) {
						case DIFF_EQUAL:
							position += text.length;
							break;
						case DIFF_DELETE:
							ops.push({
								p: basePath.concat([position]),
								sd: text
							});
							break;
						case DIFF_INSERT:
							ops.push({
								p: basePath.concat([position]),
								si: text
							});

							position += text.length;
							break;
					}
				});

				return ops;
			},

			patchStringFromOps: function(str, ops) {
				_.each(ops, function(op) {
					var pathIndex = op.p[op.p.length - 1],
						deleted;

					if (op.si) {
						str = str.slice(0, pathIndex) + op.si + str.slice(pathIndex)
					}

					if (op.sd) {
						deleted = str.slice(pathIndex, pathIndex + op.sd.length);
						if (op.sd !== deleted) {
							throw new Error('Delete component ' + op.sd + ' does not match deleted text ' + deleted);
						}
						str = str.slice(0, pathIndex) + str.slice(pathIndex + op.sd.length);
					}
				});

				return str;
			}
		}
	}).call(this);

	//Lifted from jQuery
	var type = (function() {
		var class2type = {};

		_.each("Boolean Number String Function Array Date RegExp Object".split(" "), function(name) {
			class2type[ "[object " + name + "]" ] = name.toLowerCase();
		});

		return function( obj ) {
			return obj == null ?
				String(obj):
				class2type[Object.prototype.toString.call(obj)] || "object";
		}
	}).call(this);

	var S4 = function() {
		return (((1 + Math.random()) * 65536) | 0).toString(16).substring(1);
	};

	var generateGUID = function() {
		return S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4();
	};

	var isShareModel = function(obj) {
		return obj instanceof Backbone.SharedModel || obj instanceof Backbone.SharedCollection;
	};

	var groupStringOps = function(ops, start) {
		var offset = 2,
			i = start,
			op = ops[i++],
			stringOps = [op],
			path = op.p.slice(0, op.p.length - offset);

		while (i < ops.length) {
			op = ops[i++];
			if ((op.si || op.sd) && _.isEqual(path, op.p.slice(0, op.p.length - offset))) {
				stringOps.push(op);
			} else {
				break;
			}
		}

		return {ops: stringOps, newIndex: --i};
	};

	var onRemoteOp = function(ops) {
		var stringOperations,
			op,
			i;

		if (this.lastOps === ops) return;
		
		this.lastOps = ops;

		for (i = 0; i < ops.length; i++) {
			op = ops[i];
			if (op.si || op.sd) {
				stringOperations = groupStringOps(ops, i);
				i = stringOperations.newIndex;

				this._handleOperations(stringOperations.ops);
			} else {
				this._handleOperations([op], {undo: true});
			}
		}
	};

	var UndoContext = function() {
		this.stack = [];
		this.index = -1;
	};

	_.extend(UndoContext.prototype, {
		pushOps: function(ops) {
			if (this.stack.length && this.index !== this.stack.length - 1) {
				this.stack = this.stack.slice(0, Math.max(0, this.index + 1));
				this.index = this.stack.length - 1;
			}

			this.stack.push(ops);
			this.index++;
		},

		undo: function(model) {
			var ops;

			if (this.stack.length && this.index >= 0 ) {
				ops = this.stack[this.index--]; 
				this._undoRedo(model, model.shareDoc.type.invert(ops));
			}
		},

		redo: function(model) {
			if (this.stack.length) {
				this._undoRedo(model, this.stack[++this.index]);
			}
		},

		_undoRedo: function(model, ops) {
			var offset = 1,
				root = model,
				path,
				stringOperations,
				op,
				i;

			while (model.parent) {
				root = model = model.parent;
			}

			for (i = 0; i < ops.length; i++) {
				op = ops[i];
				if (op.si || op.sd) {
					offset = 2;

					stringOperations = groupStringOps(ops, i);
					i = stringOperations.newIndex;

					path = op.p.slice(0, op.p.length - offset).reverse();
					root.getAt(path)._handleOperations(stringOperations.ops, {undo: true});
				} else {
					path = op.p.slice(0, op.p.length - offset).reverse();
					root.getAt(path)._handleOperations([op], {undo: true});
				}
			}

			root.shareDoc.submitOp(ops);
		}
	});

	var common = {
		share: function(callback, caller) {
			if (this.shareDoc) return callback ? callback.call(this, null, this) : this;

			var self = this;

			if (!this.parent) {
				this.documentName = this.documentName || this.generateDocumentName();
				sharejs.open(this.documentName, 'json', function(error, doc) {
					Backbone.ShareLogger.log('Opened document "' + self.documentName + '"');
					var created = doc.created;

					self.once('share:connected', function() {
						if (callback) 
							callback.call(caller || self, error, self, created);
					});

					self._initShareDoc(doc);
				});
			} else {
				this.parent.share(callback, caller || this);
			}

			return this;
		},

		unshare: function() {
			if (!this.shareDoc) return this;

			if (!this.parent) {
				this.shareDoc.close();
			} else {
				this.parent.unshare();
			}
			
			this.shareDoc.removeListener('remoteop', this._onRemoteOp);
			this.shareDoc = null;
		},

		undo: function() {
			this.undoContext.undo(this);

			return this;
		},

		redo: function() {
			this.undoContext.redo(this);

			return this;
		},

		generateDocumentPath: function(parent, path) {
			return parent ? parent.documentPath.concat(path) : [];
		},

		getAt: function(path) {
			var currentModel = this;

			while (path.length) {
				currentModel = currentModel._getAtPathPart(path.pop());
			}

			return currentModel;
		},

		_initShareDoc: function(shareDoc) {
			var self = this;

			if (shareDoc.type.name !== 'json') {
				throw new Error('ShareJS document must be of type "json"');
			}

			this.shareDoc = shareDoc;

			if (shareDoc.created) {
				shareDoc.submitOp([{p: [], od: null, oi: this._initialState()}], this._submitHandler);
				shareDoc.created = false;
			} else if (!this.parent) {
				this._initFromSnapshot(shareDoc.snapshot);
			}

			//Prevent redundant bindings
			if (this._onRemoteOp) {
				shareDoc.removeListener(this._onRemoteOp);
			}
			this._onRemoteOp = shareDoc.on('remoteop', onRemoteOp.bind(this));

			this.trigger('share:connected', this.shareDoc);
		},

		_refreshHierarchy: function(parent, path) {
			var self = this;

			this.documentPath = this.generateDocumentPath(parent, path);

			this.undoContext = parent.undoContext;
			if (!this.parent) return;
			
			if (this.parent.shareDoc) {
				this._initShareDoc(parent.shareDoc);
			} else {
				this.parent.once('share:connected', function(shareDoc) {
					self._attach(self.parent, path);
					self._initShareDoc(shareDoc);
				});
			}
		},

		_setParent: function(parent, path) {
			if (this.parent) {
				this._detach();
			}

			if (parent) {
				this._attach(parent, path);
			}
		},

		_attach: function(parent, path) {
			var self = this;

			this.parent = parent;

			this._refreshHierarchy(parent, path);

			this.listenTo(parent, 'attached', function() {
				self._refreshHierarchy(parent, path);
			});

			this.trigger('attached');
		},

		_detach: function() {
			this.stopListening(this.parent);

			this.documentPath = this.generateDocumentPath();
			this.undoContext = new UndoContext();
			this.parent = null;
			this.shareDoc = null;

			this.trigger('detached');
		},

		_submitHandler: function(error) {
			if (error) throw error;
		}
	};

	var sharedModelProto = {
		constructor: function(attr, options) {
			var self = this;

			this.documentPath = this.generateDocumentPath();
			this.undoContext = new UndoContext();

			Backbone.Model.prototype.constructor.apply(this, arguments);

			attr = attr || {};

			this.set('id', attr.id || generateGUID());
			
			this.defaults = this.defaults || {};

			if (!Array.isArray(this.documentPath)) {
				throw new Error('Document path must be an array');
			}

			this._attachSubModels(this.attributes);

			this.on('change', function(model, options) {
				if (!options || (!options.local && !options.silent)) {
					return self._sendModelChange(options);
				}
			});
		},

		set: function(key, val, options) {
			var attrs, self = this;
			if (key == null) return this;

			// Handle both `"key", value` and `{key: value}` -style arguments.
			if (_.isObject(key)) {
				attrs = key;
				options = val;
			} else {
				(attrs = {})[key] = val;
			}

			if (!options || !options.unset) {
				_.each(_.pairs(attrs), function(pair) {
					var k = pair[0], v = pair[1], newModels;

					if (self.subDocTypes && self.subDocTypes[k] && !isShareModel(v)) {
						attrs[k] = new self.subDocTypes[k](null, {local: true});
						attrs[k]._setParent(self, k);
						if (attrs[k] instanceof Backbone.SharedModel) {
							attrs[k].set(v, {local: true});
						} else {
							newModels = [];
							_.each(v, function(model, i) {
								newModels[i] = new attrs[k].model(v[i], {local: true});
								newModels[i]._setParent(attrs[k], i);
							});
							attrs[k].add(newModels, {local: true});
						}
					}
				});
			}

			Backbone.Model.prototype.set.call(this, attrs, options);

			this._attachSubModels(attrs);
		},

		generateDocumentName: function() {
			return this.get('id');
		},

		toJSON: function() {
			var json = _.clone(this.attributes);

			_.each(_.pairs(this.attributes), function(pair) {
				var k = pair[0], v = pair[1];

				if (isShareModel(v)) {
					json[k] = v.toJSON();
				}
			});

			return json;
		},

		_initialState: function() {
			return this.toJSON();
		},

		_getAtPathPart: function(part) {
			return this.get(part);
		},

		_initFromSnapshot: function(snapshot) {
			this.set(_.clone(snapshot), {local: true});
		},

		_attachSubModels: function(attributes) {
			var self = this;

			_.each(_.pairs(attributes), function(pair) {
				var k = pair[0], v = pair[1];

				if (isShareModel(v)) {
					v._setParent(self, [k]);
				}
			});
		},

		_sendModelChange: function(options) {
			var self = this;

			var ops = [];
			_.each(_.pairs(this.changedAttributes()), function(pair) {
				var k = pair[0], v = pair[1], t = type(v), prev = self.previous(k);
				var path = self.documentPath.concat([k]), result;
				
				switch(t) {
					case 'string':
						if (typeof prev === 'undefined') ops.push({p: path, oi: v});
						Array.prototype.push.apply(ops, dmp.getStringOps(prev, v, path));
						break;
					case 'number':
						if (typeof prev === 'undefined') ops.push({p: path, oi: v});
						ops.push({p: path, na: v - (prev || 0)});
						break;
					case 'boolean':
						if (typeof prev === 'undefined') ops.push({p: path, oi: v});
						ops.push({p: path, oi: v, od: !v});
						break;
					case 'object':
					case 'array':
						result = {p: path};

						if (isShareModel(v)) {
							result.oi = v.toJSON();
						} else {
							result.oi = v;
						}

						if (prev) {
							if (isShareModel(prev)) {
								result.od = prev.toJSON();
							} else {
								result.od = prev;
							}
						}

						ops.push(result);
						break;
					case 'null':
					case 'undefined':
						result = {p: path};

						if (isShareModel(prev)) {
							result.od = prev.toJSON();
						} else {
							result.od = prev;
						}

						ops.push(result);
						break;
					default:
						Backbone.ShareLogger.log('Ignoring attempt to send change on type ' + t);
						break;
				}
			});

			if (!options || (!options.undo && !options.silent)) {
				this.undoContext.pushOps(ops);
			}

			if (this.shareDoc) {
				Backbone.ShareLogger.log('Sending:', ops);
				this.shareDoc.submitOp(ops, this._submitHandler);
			} else {
				console.log('Not connected, ignoring ', ops);
			}
		},

		_handleOperations: function (ops, options) {
			var self = this,
				offset = 1;

			if ((ops[0].si || ops[0].sd) && _.isEqual(ops[0].p.slice(0, ops[0].p.length - 2), this.documentPath)) {
				self._handleStringOperations(ops, options);
			} else {
				_.each(ops, function(op, i) {
					if (op.p.length === 0 && op.od && op.oi) {
						self._initFromSnapshot(self.shareDoc.snapshot);
					} else if (_.isEqual(op.p.slice(0, op.p.length - offset), self.documentPath)) {
						if (op.oi || op.od) self._handleObjectOperation(op, options);
						if (op.na) self._handleNumberOperation(op, options);
					}
				});
			}
		},

		_handleStringOperations: function(ops, options) {
			console.log('Handling:', ops);

			var offset = 2,
				pathProp = ops[0].p[ops[0].p.length - offset],
				original = this.get(pathProp),
				modified;

			options = options || {};
			options.local = true;

			modified = dmp.patchStringFromOps(original, ops);
			this.set(pathProp, modified, options);
		},

		_handleObjectOperation: function(op, options) {
			console.log('Handling:', op);

			var pathProp = op.p[op.p.length - 1],
				obj = this.get(pathProp),
				subDocTypes = this.subDocTypes || {},
				subDocType = subDocTypes[pathProp];

			options = options || {};
			options.local = true;

			if (op.oi || op.oi === false) {
				if (subDocType) {
					this.set(pathProp, new subDocType(op.oi), options);
				} else {
					this.set(pathProp, op.oi, options);
				}
			} else {
				this.unset(pathProp, options);
				if (subDocType) {
					obj._setParent(null);
					obj.unshare();
				}
			}
		},

		_handleNumberOperation: function(op, options) {
			console.log('Handling:', op);
			
			var pathProp = op.p[op.p.length - 1],
				currentValue = this.get(pathProp);

			options = options || {};
			options.local = true;

			this.set(pathProp, currentValue + op.na, options);
		}
	};

	var sharedCollectionProto = {
		constructor: function(models, options) {
			var self = this;

			this.documentPath = this.generateDocumentPath();
			this.undoContext = new UndoContext();

			Backbone.Collection.prototype.constructor.apply(this, arguments);

			options = options || {};

			if (!Array.isArray(this.documentPath)) {
				throw new Error('Document path must be an array');
			}
		},

		add: function(models, options) {
			Backbone.Collection.prototype.add.apply(this, arguments);

			models =  models = _.isArray(models) ? models.slice() : [models];

			this._attachSubModels(models, options);
		},

		remove: function(models, options) {
			var ops;
			models =  models = _.isArray(models) ? models.slice() : [models];

			if (!options || (!options.local  && !options.silent)) {
				ops = this._prepareListChanges(models, 'remove');
			}

			if (ops) {
				this._sendOps(ops, options, this._submitHandler);
			}

			_.each(models, function(model) {
				model._setParent(null);
			});

			Backbone.Collection.prototype.remove.apply(this, arguments);
		},

		generateDocumentName: function() {
			return generateGUID();
		},

		_attachSubModels: function(models, options) {
			var self = this;

			_.each(models, function(model) {
				model._setParent(self, [self.indexOf(model)]);
			});

			if (!options || (!options.local && !options.silent)) {
				return this._sendOps(this._prepareListChanges(models, 'add'),
					options, this._submitHandler);
			}
		},

		_initialState: function() {
			return [];
		},

		_getAtPathPart: function(part) {
			return this.at(part);
		},

		_initFromSnapshot: function(snapshot) {
			var self = this;

			if (!snapshot || !snapshot.length) return;

			_.each(snapshot, function(model) {
				self.add(new self.model(model), {local: true});
			});
		},

		_prepareListChanges: function(models, type) {
			var self = this;
			var ops = _.map(models, function(model) {
				var op = {
					p: self.documentPath.concat([self.indexOf(model)])
				}

				switch (type) {
					case 'add':
						op.li = model.toJSON();
						break;
					case 'remove':
						op.ld = model.toJSON();
						break;
					default:
						throw new Error('Unrecognized list operation type: ' + type);
				}

				return op;
			});

			//Work backwards so that ld operations don't corrupt the snapshot due to splicing
			if (type === 'remove') {
				ops = _.sortBy(ops, function(op) {
					return -op.p[op.p.length - 1];
				});
			}

			return ops;
		},

		_sendOps: function(ops, options, callback) {
			if (this.shareDoc) {
				Backbone.ShareLogger.log('Sending:', ops);
				this.shareDoc.submitOp(ops, callback);
			} else {
				console.log('Not connected, ignoring ', ops);
			}

			if (!options || !options.undo) {
				this.undoContext.pushOps(ops);
			}
		},

		_handleOperations: function(ops) {
			var self = this;

			_.each(ops, function(op, i) {
				var offset = op.si || op.sd ? 2 : 1;
				if (op.p.length === 0 && op.od && op.oi) {
					self._initFromSnapshot(self.shareDoc.snapshot);
				} else if (_.isEqual(op.p.slice(0, op.p.length - offset), self.documentPath)) {
					console.log('Handling:', op);

					if (op.li) {
						self.add(new self.model(op.li), {at: op.p[op.p.length - 1], local: true});
					}

					if (op.ld) {
						self.remove(self.at(op.p[op.p.length - 1]), {local: true});
					}
				}
			});
		}
	};

	_.extend(sharedModelProto, common);
	_.extend(sharedCollectionProto, common);

	Backbone.UndoContext = UndoContext;
	Backbone.SharedModel = Backbone.Model.extend(sharedModelProto);
	Backbone.SharedCollection = Backbone.Collection.extend(sharedCollectionProto);

}).call(this);