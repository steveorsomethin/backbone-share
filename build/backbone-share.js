/* Copyright 2013 Steve McGuire - https://github.com/steveorsomethin
*
*   Licensed under the Apache License, Version 2.0 (the "License");
*   you may not use this file except in compliance with the License.
*   You may obtain a copy of the License at
*
*       http://www.apache.org/licenses/LICENSE-2.0
*
*   Unless required by applicable law or agreed to in writing, software
*   distributed under the License is distributed on an "AS IS" BASIS,
*   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
*   See the License for the specific language governing permissions and
*   limitations under the License.
*/

(function(){
	var root = this,
		Backbone = root.Backbone,
		sharejs = root.sharejs,
		_ = root._;

	Backbone.ShareLogger = console;

	// Returns an operation path without the target property
	// Example string op input of {si: "abc", p: ['person', 'name', 0]}
	// would yield ['person']
	// Any other operation type such as {oi: {name: "abc"}, p: ['person']}
	// would yield []
	var getBasePath = function(op) {
		var offset = op.si || op.sd ? 2 : 1;

		return op.p.slice(0, op.p.length - offset);
	};

	// Returns the target property of an operation path
	var getPathProperty = function(op) {
		var offset = op.si || op.sd ? 2 : 1;

		return op.p[op.p.length - offset];
	};

	// Utilities for extracting and patching string differences.
	var dmp = (function() {
		var diff_match_patch = this.diff_match_patch,
			DIFF_EQUAL = this.DIFF_EQUAL,
			DIFF_DELETE = this.DIFF_DELETE,
			DIFF_INSERT = this.DIFF_INSERT;

		var dmp = new diff_match_patch();
		return {
			// Uses google's diff_match_patch and digests the diff output
			// into a series of string ops
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

			// Applies a group of string operations to a target string in
			// a single pass. Doesn't actually use diff_match_patch(yet)
			patchStringFromOps: function(str, ops) {
				_.each(ops, function(op) {
					var pathIndex = op.p[op.p.length - 1],
						deleted;

					if (op.si) {
						str = str.slice(0, pathIndex) + op.si + str.slice(pathIndex);
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
		};
	}).call(this);

	//Lifted from jQuery
	var type = (function() {
		var class2type = {};

		_.each("Boolean Number String Function Array Date RegExp Object".split(" "), function(name) {
			class2type[ "[object " + name + "]" ] = name.toLowerCase();
		});

		return function(obj) {
			return obj == null ?
				String(obj):
				class2type[Object.prototype.toString.call(obj)] || "object";
		};
	}).call(this);

	var S4 = function() {
		return (((1 + Math.random()) * 65536) | 0).toString(16).substring(1);
	};

	// Potentially not reliable. Lib users can supply their own IDs if desired
	var generateGUID = function() {
		return S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4();
	};

	var isShareModel = function(obj) {
		return obj instanceof Backbone.SharedModel || obj instanceof Backbone.SharedCollection;
	};

	// Detects any grouping of contiguous string ops in an op array
	// Useful for applying a complex patch against a string in a single go
	var groupStringOps = function(ops, start) {
		var i = start,
			op = ops[i++],
			stringOps = [op],
			path = getBasePath(op);

		while (i < ops.length) {
			op = ops[i++];
			if ((op.si || op.sd) && _.isEqual(path, getBasePath(op))) {
				stringOps.push(op);
			} else {
				break;
			}
		}

		return {ops: stringOps, newIndex: --i};
	};

	// Handler for sharejs 'remoteop' event
	// Intended to be bound to the caller and passed to sharejs
	var onRemoteOp = function(ops) {
		var stringOperations,
			op,
			i;

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

	// Object for managing undo and redo state
	var UndoContext = function() {
		this.stack = [];
		this.index = -1;
	};

	_.extend(UndoContext.prototype, {
		// Diverts any operations applied to models using this undo context
		// into a temporary array. Pumps the grouped operations as a single
		// undo stack entry after the supplied context function exits
		group: function(contextFunc) {
			var groupedOps = this.groupedOps = [];

			contextFunc.call();

			this.groupedOps = null;
			this.pushOps(groupedOps);
		},

		// Prevents any operations applied to models inside the supplied 
		// context function from creating an undo stack entry
		prevent: function(contextFunc) {
			this.preventUndo = true;

			contextFunc.call();

			this.preventUndo = false;
		},

		// Adds the supplied operation array to the undo stack
		pushOps: function(ops) {
			if (this.groupedOps) {
				Array.prototype.push.apply(this.groupedOps, ops);
			} else if (!this.preventUndo) {
				if (this.stack.length && this.index !== this.stack.length - 1) {
					this.stack = this.stack.slice(0, Math.max(0, this.index + 1));
					this.index = this.stack.length - 1;
				}

				this.stack.push(ops);
				this.index++;
			}
		},

		// Moves the undo stack pointer down and applies the previous 'head'
		// operations to the supplied model
		undo: function(model) {
			var ops;

			if (this.stack.length && this.index >= 0 ) {
				ops = this.stack[this.index--]; 
				this._undoRedo(model, model.shareDoc.type.invert(ops));
			}
		},

		// Moves the undo stack point up and applies the prevous 'head'
		// operations to the supplied model
		redo: function(model) {
			if (this.stack.length && this.index < this.stack.length - 1) {
				this._undoRedo(model, this.stack[++this.index]);
			}
		},

		// The guts of undo and redo. Finds the root object in order to find
		// the actual object to apply operations to based on each operation path 
		_undoRedo: function(model, ops) {
			var root = model,
				path,
				stringOperations,
				op,
				i;

			while (model.parent) {
				root = model = model.parent;
			}

			for (i = 0; i < ops.length; i++) {
				op = ops[i];
				path = getBasePath(op).reverse();
				
				if (op.si || op.sd) {
					stringOperations = groupStringOps(ops, i);
					i = stringOperations.newIndex;

					root.getAt(path)._handleOperations(stringOperations.ops, {undo: true});
				} else {
					root.getAt(path)._handleOperations([op], {undo: true});
				}
			}

			root.shareDoc.submitOp(ops);
		}
	});

	// The base object containing common functionality for SharedModel and SharedCollection
	var common = {

		// Connects this model and its children to the sharejs server based on the root
		// model's documentName property. The callback is expected to accept error, root,
		// and created params, where error is a sharejs error, root is the root of the 
		// model tree, and created is a flag indicating that the document was created in
		// the sharejs store
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

		// Disconnects the model and its children from the sharejs server
		unshare: function() {
			if (!this.shareDoc) return this;

			if (!this.parent) {
				this.shareDoc.close();
			} else {
				this.parent.unshare();
			}
			
			if (this._onRemoteOp) {
				Object.getPrototypeOf(this.shareDoc).removeListener
					.call(this.shareDoc, 'remoteop', this._onRemoteOp);
			}
			this.shareDoc = null;
		},

		// Wrapper for UndoContext.group
		groupUndoOps: function(contextFunc) {
			this.undoContext.group(contextFunc.bind(this));

			return this;
		},

		// Wrapper for UndoContext.prevent
		preventUndo: function(contextFunc) {
			this.undoContext.prevent(contextFunc.bind(this));

			return this;
		},

		// Wrapper for UndoContext.undo
		undo: function() {
			if (this.shareDoc) {
				this.undoContext.undo(this);
			}

			return this;
		},

		// Wrapper for UndoContext.redo
		redo: function() {
			if (this.shareDoc) {
				this.undoContext.redo(this);
			}

			return this;
		},

		// Generates a path array based on this model's parent path, and
		// the propety path relative to the parent
		generateDocumentPath: function(parent, path) {
			return parent ? parent.documentPath.concat(path) : [];
		},

		// Utility function to get a nested model at a given sharejs path
		getAt: function(path) {
			var currentModel = this;

			while (path.length) {
				currentModel = currentModel._getAtPathPart(path.pop());
			}

			return currentModel;
		},

		// Internal function for attaching a model to a sharejs document
		// once connection is successful
		_initShareDoc: function(shareDoc) {
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
				//TODO: Find a way around this minor wtf
				Object.getPrototypeOf(shareDoc).removeListener.call(shareDoc, 'remoteop', this._onRemoteOp);
			} else {
				this._onRemoteOp = onRemoteOp.bind(this);
			}

			shareDoc.on('remoteop', this._onRemoteOp);

			this.trigger('share:connected', this.shareDoc);
		},

		// Refreshes this model's path information and listeners in order to
		// preserve the model tree's consistency
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

		// Sets the parent ShareModel|Collection
		_setParent: function(parent, path) {
			if (this.parent) {
				this._detach();
			}

			if (parent) {
				this._attach(parent, path);
			}
		},

		// Calls refreshHierarchy and lets child models know that
		// they should start initializing
		_attach: function(parent, path) {
			var self = this;

			this.parent = parent;

			this._refreshHierarchy(parent, path);

			this.listenTo(parent, 'attached', function() {
				self._refreshHierarchy(parent, path);
			});

			this.trigger('attached');
		},

		// Cleans up listeners and sharejs information on this model
		_detach: function() {
			this.stopListening(this.parent);

			this.documentPath = this.generateDocumentPath();
			this.undoContext = new UndoContext();
			this.parent = null;
			this.shareDoc = null;

			this.trigger('detached');
		},

		// Generic sharejs error handler
		_submitHandler: function(error) {
			if (error) throw error;
		}
	};

	// A sharejs adapter for Backbone.Model
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

		// Performs model attachment and sharejs initialization of any SharedModel|Collection
		// attributes before Backbone.Model.set is called
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

		// Default behavior to generate a documentName property for sharejs
		generateDocumentName: function() {
			return this.get('id');
		},

		// Override to recursively build a json document from a complete hierarchy
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

		// Used to initialize the sharejs document for this model's path
		_initialState: function() {
			return this.toJSON();
		},

		// Used by common.getAt
		_getAtPathPart: function(part) {
			return this.get(part);
		},

		// Loads snapshot data into this model's path
		_initFromSnapshot: function(snapshot) {
			this.set(_.clone(snapshot), {local: true});
		},

		// Attaches sub SharedModel|Collection instances to this model's hierarchy
		_attachSubModels: function(attributes) {
			var self = this;

			_.each(_.pairs(attributes), function(pair) {
				var k = pair[0], v = pair[1];

				if (isShareModel(v)) {
					v._setParent(self, [k]);
				}
			});
		},

		// Detects changed attributes and builds an array of operations, then issues
		// the operations to this model's sharejs document
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

			if (this.shareDoc) {
				if (ops.length) {
					Backbone.ShareLogger.log('Sending:', ops);
					this.shareDoc.submitOp(ops, this._submitHandler);
					if (!options || (!options.undo && !options.silent)) {
						this.undoContext.pushOps(ops);
					}
				}
			} else {
				console.log('Not connected, ignoring ', ops);
			}
		},

		// Applies incoming sharejs operations to this model
		_handleOperations: function (ops, options) {
			var self = this;

			if ((ops[0].si || ops[0].sd) && _.isEqual(ops[0].p.slice(0, ops[0].p.length - 2), this.documentPath)) {
				self._handleStringOperations(ops, options);
			} else {
				_.each(ops, function(op, i) {
					if (op.p.length === 0 && op.od && op.oi) {
						self._initFromSnapshot(self.shareDoc.snapshot);
					} else if (_.isEqual(getBasePath(op), self.documentPath)) {
						if (op.oi || op.od) self._handleObjectOperation(op, options);
						if (op.na) self._handleNumberOperation(op, options);
					}
				});
			}
		},

		_handleStringOperations: function(ops, options) {
			console.log('Handling:', ops);

			var pathProp = getPathProperty(ops[0]),
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

	// A sharejs adapter for Backbone.Collection
	var sharedCollectionProto = {
		constructor: function(models, options) {
			this.documentPath = this.generateDocumentPath();
			this.undoContext = new UndoContext();

			Backbone.Collection.prototype.constructor.apply(this, arguments);

			options = options || {};

			if (!Array.isArray(this.documentPath)) {
				throw new Error('Document path must be an array');
			}
		},

		// Attaches sub SharedModels after they're attached to this collection
		add: function(models, options) {
			Backbone.Collection.prototype.add.apply(this, arguments);

			models =  models = _.isArray(models) ? models.slice() : [models];

			if (models.length) {
				this._attachSubModels(models, options);
			}
		},

		// Prepares and sends list ops, detaches removed models from this tree
		// Then refreshes the paths of all contained models
		remove: function(models, options) {
			var ops, self = this;
			models =  models = _.isArray(models) ? models.slice() : [models];

			if (!models.length) return;

			if (!options || (!options.local  && !options.silent)) {
				ops = this._prepareListChanges(models, 'remove');
			}

			if (ops) {
				this._sendOps(ops, options, this._submitHandler);
			}

			_.each(models, function(model) {
				if (self.indexOf(model) === -1) return;

				model._setParent(null);
			});

			Backbone.Collection.prototype.remove.apply(this, arguments);

			_.each(this.models, function(model) {
				model._setParent(self, self.indexOf(model));
			});
		},

		// Default behavior to generate a documentName property for sharejs
		generateDocumentName: function() {
			return generateGUID();
		},

		// Attaches sub SharedModel instances to this model's hierarchy
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

		// Used to initialize the sharejs document for this model's path
		_initialState: function() {
			return [];
		},

		// Used by common.getAt
		_getAtPathPart: function(part) {
			return this.at(part);
		},

		// Loads snapshot data into this model's path
		_initFromSnapshot: function(snapshot) {
			var self = this;

			if (!snapshot || !snapshot.length) return;

			_.each(snapshot, function(model) {
				self.add(new self.model(model), {local: true});
			});
		},

		// Prepares an array of operations based on the affected models and the
		// operation type ('add'|'remove') and returns rather than sends it
		_prepareListChanges: function(models, type) {
			var self = this;
			var ops = [];
			_.each(models, function(model) {
				if (self.indexOf(model) === -1) return;

				var op = {
					p: self.documentPath.concat([self.indexOf(model)])
				};

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

				ops.push(op);
			});

			//Work backwards so that ld operations don't corrupt the snapshot due to splicing
			if (type === 'remove') {
				ops = _.sortBy(ops, function(op) {
					return -op.p[op.p.length - 1];
				});
			}

			return ops;
		},

		// Sends the supplied operations to the collection's sharejs document
		_sendOps: function(ops, options, callback) {
			if (this.shareDoc) {
				Backbone.ShareLogger.log('Sending:', ops);
				this.shareDoc.submitOp(ops, callback);

				if (!options|| (!options.undo && !options.silent)) {
					this.undoContext.pushOps(ops);
				}
			} else {
				console.log('Not connected, ignoring ', ops);
			}
		},

		// Applies incoming sharejs operations to this collection
		_handleOperations: function(ops) {
			var self = this;

			_.each(ops, function(op, i) {
				if (op.p.length === 0 && op.od && op.oi) {
					self._initFromSnapshot(self.shareDoc.snapshot);
				} else if (_.isEqual(getBasePath(op), self.documentPath)) {
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