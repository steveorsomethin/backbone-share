
(function(){
	var root = this,
		Backbone = root.Backbone,
		sharejs = root.sharejs,
		_ = root._;
	//TODO: Ensure the above imports are resolved and work in node.js

	var diff = (function() {
		/* 
		* TODO: Look into adapting more of the diff algorithm to make more efficient patches 
		*		when there are multiple, non-sequential updates to a string
		*/
		//The following two methods were lifted from http://code.google.com/p/google-diff-match-patch/
		var diff_commonPrefix = function(text1, text2) {
			// Quick check for common null cases.
			if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {
				return 0;
			}
			// Binary search.
			// Performance analysis: http://neil.fraser.name/news/2007/10/09/
			var pointermin = 0;
			var pointermax = Math.min(text1.length, text2.length);
			var pointermid = pointermax;
			var pointerstart = 0;
			while (pointermin < pointermid) {
				if (text1.substring(pointerstart, pointermid) ==
						text2.substring(pointerstart, pointermid)) {
					pointermin = pointermid;
					pointerstart = pointermin;
				} else {
					pointermax = pointermid;
				}
				pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
			}
			return pointermid;
		};

		var diff_commonSuffix = function(text1, text2) {
			// Quick check for common null cases.
			if (!text1 || !text2 ||
					text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {
				return 0;
			}
			// Binary search.
			// Performance analysis: http://neil.fraser.name/news/2007/10/09/
			var pointermin = 0;
			var pointermax = Math.min(text1.length, text2.length);
			var pointermid = pointermax;
			var pointerend = 0;
			while (pointermin < pointermid) {
				if (text1.substring(text1.length - pointermid, text1.length - pointerend) ==
						text2.substring(text2.length - pointermid, text2.length - pointerend)) {
					pointermin = pointermid;
					pointerend = pointermin;
				} else {
					pointermax = pointermid;
				}
				pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
			}
			return pointermid;
		};

		return function(str1, str2) {
			var prefix = diff_commonPrefix(str1, str2),
				suffix = diff_commonSuffix(str1, str2);

			return {
				d: str1.substring(prefix, str1.length - suffix),
				i: str2.substring(prefix, str2.length - suffix),
				p: prefix
			};
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
				String(obj ):
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

	var attachSubModels = function(attributes) {
		var self = this;

		_.each(_.pairs(attributes), function(pair) {
			var k = pair[0], v = pair[1];

			if (isShareModel(v)) {
				v._setParent(self, [k]);
			}
		});
	};

	Backbone.SharedModel = Backbone.Model.extend({
		constructor: function(attr, options) {
			Backbone.Model.prototype.constructor.apply(this, arguments);

			var self = this;

			attr = attr || {};

			this.set('id', attr.id || generateGUID());
			
			this.defaults = this.defaults || {};
			this.documentPath = this.generateDocumentPath();
			this.pendingOperations = [];
			this.undoStack = [];
			this.undoIndex = -1;

			if (!this.subDocTypes) {
				this._inferSubDocTypes();
			}

			if (!Array.isArray(this.documentPath)) {
				throw new Error('Document path must be an array');
			}

			attachSubModels.call(this, this.attributes);

			this.on("change", function(model, options) {
				console.log(this.changedAttributes());
				if (!options || !options.local) {
					return self._sendModelChange(options);
				}

				attachSubModels.call(this, this.changedAttributes());
			});
		},

		generateDocumentPath: function() {
			return [];
		},

		generateDocumentName: function() {
			return this.get('id');
		},

		share: function(callback, caller) {
			if (this.shareDoc) return callback.call(this, null, this);

			var self = this;

			if (!this.parent) {
				this.documentName = this.generateDocumentName();
				sharejs.open(this.documentName, 'json', function(error, doc) {
					console.log('Opened document "' + self.documentName + '"');

					self.once('share:connected', function() {
						callback.call(caller || self, error, self);
					});

					self._initShareDoc(doc);
				});
			} else {
				this.parent.share(callback, caller || this);
			}
		},

		undo: function() {
			var ops;
			if (this.undoStack.length && this.undoIndex >= 0 ) {
				ops = this.undoStack[this.undoIndex--]; 
				this._undoRedo(this.shareDoc.type.invert(ops));
			}
		},

		redo: function() {
			if (this.undoStack.length) {
				this._undoRedo(this.undoStack[++this.undoIndex]);
			}
		},

		_undoRedo: function(ops) {
			var self = this;

			_.each(ops, function(op) {
				self._handleOperation(op, {undo: true});
			});

			this.shareDoc.submitOp(ops);
		},

		_setParent: function(parent, path) {
			var self = this;

			this.parent = parent;

			//TODO: Call this.generateDocumentPath with parent instead
			this.documentPath = parent.generateDocumentPath().concat(path);

			if (this.parent.shareDoc) {
				this._initShareDoc(this.parent.shareDoc);
			} else {
				this.parent.on('share:connected', function(shareDoc) {
					self._initShareDoc(shareDoc);
				});
			}
		},

		_initShareDoc: function(shareDoc) {
			var self = this, attributes;

			if (shareDoc.type.name !== 'json') {
				throw new Error('ShareJS document must be of type "json"');
			}

			this.shareDoc = shareDoc;

			if (shareDoc.created) {
				shareDoc.submitOp([{p: this.documentPath, od: null, oi: this.toJSON()}]);
				shareDoc.created = false;
			}

			shareDoc.on('remoteop', function(ops) {
				_.each(ops, function(op, i) {
					if (_.isEqual(op.p, self.documentPath)) {
						this._handleOperation(op);
					}
				});
			});

			if (this.pendingOperations.length) {
				shareDoc.submitOp(this.pendingOperations, function(error) {
					if (!error) self.pendingOperations.length = 0;
					this.trigger('share:connected', this.shareDoc);
				});
			} else {
				this.trigger('share:connected', this.shareDoc);
			}
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
				var result, textDiff;
				result = {p: self.documentPath.concat([k])};
				switch(t) {
					case 'string':
						textDiff = diff(prev, v);
						result.p.push(textDiff.p);

						if (!!textDiff.d) {
							result.sd = textDiff.d;
						}
						if (!!textDiff.i) {
							if (result.sd) {
								ops.push(result);
								result = _.clone(result);
								delete result.sd;
							}
							result.si = textDiff.i;
						}
						break;
					case 'number':
						result.na = v - prev;
						break;
					case 'boolean':
						result.oi = v;
						result.od = !v;
						break;
					case 'object':
					case 'array':
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
						break;
					case 'null':
					case 'undefined':
						if (isShareModel(prev)) {
							result.od = prev.toJSON();
						} else {
							result.od = prev;
						} 
						break;
					default:
						console.log('Ignoring attempt to send change on type ' + t);
						break;
				}

				return ops.push(result);
			});

			if (!options || !options.undo) {
				if (this.undoStack.length && this.undoIndex !== this.undoStack.length - 1) {
					this.undoStack = this.undoStack.slice(0, Math.max(0, this.undoIndex + 1));
					this.undoIndex = this.undoStack.length - 1;
				}

				this.undoStack.push(ops);
				this.undoIndex++;
			}

			if (this.shareDoc) {
				console.log('Sending:', ops);
				this.shareDoc.submitOp(ops, function(error, ops) {
					//self.shareDoc.submitOp(self.shareDoc.type.invert(ops), function() {
						console.log(arguments);
					//});
				});
			} else {
				Array.prototype.push(pendingOperations, ops);
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
	});

	// Collection path should be a simple name?
	// Need to validate models
	// Error handling on submitOp
	// Verify re-opening works
	// Clean up parent/child reference cycles
	// Connect parent/child on set
	// Need to handle connectivity on undo/redo

	Backbone.SharedCollection = Backbone.Collection.extend({
		constructor: function(models, options) {
			Backbone.Collection.prototype.constructor.apply(this, arguments);

			var self = this;

			options = options || {};

			this.documentPath = options.documentPath || this.generateDocumentPath();

			if (!Array.isArray(this.documentPath)) {
				throw new Error('Document path must be an array');
			}

			if (options.shareDoc) {
				this._initShareDoc(options.shareDoc);
			} else {
				this.documentName = options.documentName || this.generateDocumentName();
				sharejs.open(this.documentName, 'json', function(err, doc) {
					if (err) throw err;

					console.log('Opened document "' + self.documentName + '"');
					self._initShareDoc(doc);
				});
			}
		},

		generateDocumentPath: function() {
			return [];
		},

		generateDocumentName: function() {
			return generateGUID();
		},

		_initShareDoc: function(shareDoc) {
			var self = this;

			if (shareDoc.type.name !== 'json') {
				throw new Error('ShareJS document must be of type "json"');
			}

			this.shareDoc = shareDoc;

			if (shareDoc.created) {
				shareDoc.submitOp([{p: [], oi: this.toJSON()}]);
			}

			shareDoc.on('remoteop', function(ops) {
				_.each(ops, function(op, i) {
					if (_.isEqual(op.p, self.documentPath)) {
						this._handleListOperation(op);
					}
				});
			});

			this.on("add", function(model, options) {
				if (!options || !options.local) {
					return self._sendModelAdd(options);
				}
			});

			this.on("remove", function(model, options) {
				if (!options || !options.local) {
					return self._sendModelRemove(options);
				}
			});
		},

		_sendModelAdd: function(model, options) {
			var ops = [{
				p: this.documentPath.concat(
					[options && options.at ? options.at : this.length - 1]),
				li: model.toJSON()
			}];

			this.shareDoc.submitOp(ops, function(error, ops) {
				//self.shareDoc.submitOp(self.shareDoc.type.invert(ops), function() {
					console.log(arguments);
				//});
			});
		},

		_sendModelRemove: function(model, options) {
			var ops = [{
				p: this.documentPath.concat(
					[options && options.index ? options.index : this.length - 1]),
				ld: model.toJSON()
			}];

			this.shareDoc.submitOp(ops, function(error, ops) {
				//self.shareDoc.submitOp(self.shareDoc.type.invert(ops), function() {
					console.log(arguments);
				//});
			});
		},

		_handleListOperation: function(op) {
			if (op.li) {
				this.create(op.li, {local: true});
			}

			if (op.ld) {
				this.remove(op.ld, {local: true});
			}
		}
	});

}).call(this);