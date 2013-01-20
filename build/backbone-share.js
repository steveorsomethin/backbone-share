// Need to validate models
// Verify re-opening works
// Clean up parent/child reference cycles
// Need to handle connectivity on undo/redo
// List move?

(function(){
	var root = this,
		Backbone = root.Backbone,
		sharejs = root.sharejs,
		_ = root._;

	Backbone.ShareLogger = console;

	var getDiffs = (function() {
		var diff_match_patch = this.diff_match_patch,
			DIFF_EQUAL = this.DIFF_EQUAL,
			DIFF_DELETE = this.DIFF_DELETE,
			DIFF_INSERT = this.DIFF_INSERT;

		var dmp = new diff_match_patch();

		return function(str1, str2, basePath) {
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
		};

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
				path;

			while (model.parent) {
				root = model = model.parent;
			}

			_.each(ops, function(op) {
				if (op.si || op.sd) {
					offset = 2;
				}

				path = op.p.slice(0, op.p.length - offset).reverse();
				root.getAt(path)._handleOperation(op, {undo: true});
			});

			root.shareDoc.submitOp(ops);
		}
	});

	var common = {
		share: function(callback, caller) {
			if (this.shareDoc) return callback ? callback.call(this, null, this) : this;

			var self = this;

			if (!this.parent) {
				this.documentName = this.generateDocumentName();
				sharejs.open(this.documentName, 'json', function(error, doc) {
					Backbone.ShareLogger.log('Opened document "' + self.documentName + '"');

					self.once('share:connected', function() {
						if (callback) 
							callback.call(caller || self, error, self);
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
			}

			//Prevent redundant bindings
			shareDoc.removeListener('remoteop', this._onRemoteOp);
			shareDoc.on('remoteop', this._onRemoteOp);

			if (this.pendingOperations.length) {
				this.shareDoc.submitOp(this.pendingOperations, function(error) {
					if (error) throw error;

					self.pendingOperations.length = 0;
					self.trigger('share:connected', self.shareDoc);
				});
			} else {
				this.trigger('share:connected', this.shareDoc);
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

		_refreshHierarchy: function(parent, path) {
			var self = this;

			this.documentPath = this.generateDocumentPath(parent, path);

			this.undoContext = parent.undoContext;

			if (parent.shareDoc) {
				this._initShareDoc(parent.shareDoc);
			} else {
				this.listenTo(parent, 'share:connected', function(shareDoc) {
					self._initShareDoc(shareDoc);
				});
			}
		},

		_attach: function(parent, path) {
			this.parent = parent;

			this._refreshHierarchy(parent, path);

			this.listenTo(parent, 'attached detached', function() {
				this._refreshHierarchy(parent, path);
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

		_onRemoteOp: function(ops) {
			var self = this;
			_.each(ops, function(op, i) {
				var offset = op.si || op.sd ? 2 : 1;
				if (_.isEqual(op.p.slice(0, op.p.length - offset), self.documentPath)) {
					self._handleOperation(op);
				}
			});
		},

		_submitHandler: function(error) {
			if (error) throw error;
		}
	};

	var sharedModelProto = {
		constructor: function(attr, options) {
			Backbone.Model.prototype.constructor.apply(this, arguments);

			var self = this;

			attr = attr || {};

			this.set('id', attr.id || generateGUID());
			
			this.defaults = this.defaults || {};
			this.documentPath = this.generateDocumentPath();
			this.pendingOperations = [];
			this.undoContext = new UndoContext();

			if (!this.subDocTypes) {
				this._inferSubDocTypes();
			}

			if (!Array.isArray(this.documentPath)) {
				throw new Error('Document path must be an array');
			}

			this._attachSubModels(this.attributes);

			this.on("change", function(model, options) {
				if (!options || !options.local) {
					return self._sendModelChange(options);
				}

				this._attachSubModels(this.changedAttributes());
			});
		},

		generateDocumentName: function() {
			return this.get('id');
		},

		_initialState: function() {
			return this.toJSON();
		},

		_getAtPathPart: function(part) {
			return this.get(part);
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

		_inferSubDocTypes: function() {
			var self = this;
			this.subDocTypes = {};
			_.each(_.pairs(this.attributes), function(pair) {
				var k = pair[0], v = pair[1];

				if (isShareModel(v)) {
					self.subDocTypes[k] = Object.getPrototypeOf(v).constructor;
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
						Array.prototype.push.apply(ops, getDiffs(prev, v, path));
						break;
					case 'number':
						ops.push({p: path, na: v - prev});
						break;
					case 'boolean':
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

			if (!options || !options.undo) {
				this.undoContext.pushOps(ops);
			}

			if (this.shareDoc) {
				Backbone.ShareLogger.log('Sending:', ops);
				this.shareDoc.submitOp(ops, this._submitHandler);
			} else {
				Array.prototype.push.apply(this.pendingOperations, ops);
			}
		},

		_handleOperation: function (op, options) {
			if (op.si || op.sd) this._handleStringOperation(op, options);
			if (op.oi || op.od) this._handleObjectOperation(op, options);
			if (op.na) this._handleNumberOperation(op, options);
		},

		_handleStringOperation: function(op, options) {
			if (!_.isEqual(op.p.slice(0, op.p.length - 2), this.documentPath)) return;

			var pathProp = op.p[op.p.length - 2],
				pathIndex = op.p[op.p.length - 1],
				original = this.get(pathProp),
				modified, deleted;

			options = options || {};
			options.local = true;

			if (op.si) {
				this.set(
					pathProp,
					original.slice(0, pathIndex) + op.si + original.slice(pathIndex),
					options
				);
			}

			if (op.sd) {
				deleted = original.slice(pathIndex, pathIndex + op.sd.length);
				if (op.sd !== deleted) {
					throw new Error('Delete component ' + op.sd + ' does not match deleted text ' + deleted);
				}
				modified = original.slice(0, pathIndex) + original.slice(pathIndex + op.sd.length);

				this.set(pathProp, modified, options);
			}
		},

		_handleObjectOperation: function(op, options) {
			if (!_.isEqual(op.p.slice(0, op.p.length - 1), this.documentPath)) return;

			var pathProp = op.p[op.p.length - 1],
				obj = this.get(pathProp),
				subDocType = this.subDocTypes[pathProp];

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
			if (!_.isEqual(op.p.slice(0, op.p.length - 1), this.documentPath)) return;

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
			this.pendingOperations = [];
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

			if (!options || !options.local) {
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

			if (!options || !options.local) {
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
				Array.prototype.push.apply(this.pendingOperations, ops);
			}

			if (!options || !options.undo) {
				this.undoContext.pushOps(ops);
			}
		},

		_handleOperation: function(op) {
			if (op.li) {
				this.add(new this.model(op.li), {at: op.p[op.p.length - 1], local: true});
			}

			if (op.ld) {
				this.remove(this.at(op.p[op.p.length - 1]), {local: true});
			}
		}
	};

	_.extend(sharedModelProto, common);
	_.extend(sharedCollectionProto, common);

	Backbone.UndoContext = UndoContext;
	Backbone.SharedModel = Backbone.Model.extend(sharedModelProto);
	Backbone.SharedCollection = Backbone.Collection.extend(sharedCollectionProto);

}).call(this);