
(function(){
	var root = this,
		Backbone = root.Backbone,
		sharejs = root.sharejs,
		_ = root._;
	//TODO: Ensure the above imports are resolved and work in node.js

	var diff = (function() {
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

	var isBackboneModel = function(obj) {
		return obj instanceof Backbone.Model || obj instanceof Backbone.Collection
			|| obj instanceof Backbone.SharedModel || obj instanceof Backbone.SharedCollection;
	};

	Backbone.SharedModel = Backbone.Model.extend({
		constructor: function(attr, options) {
			Backbone.Model.prototype.constructor.apply(this, arguments);

			var self = this;

			options = options || {};
			this.defaults = this.defaults || {};

			this.set('id', options.id || generateGUID());
			
			this.documentPath = options.documentPath || this.generateDocumentPath();

			if (!Array.isArray(this.documentPath)) {
				throw new Error('Document path must be an array');
			}

			if (options.shareDoc) {
				this.isRoot = false;
				this.initShareDoc(options.shareDoc);
			} else {
				this.isRoot = true;
				this.documentName = options.documentName || this.generateDocumentName();
				sharejs.open(this.documentName, 'json', function(err, doc) {
					if (err) throw err;

					console.log('Opened document "' + self.documentName + '"');
					self.initShareDoc(doc);
				});
			}
		},

		generateDocumentPath: function() {
			return [];
		},

		generateDocumentName: function() {
			return this.get('id');
		},

		initShareDoc: function(shareDoc) {
			var self = this, attributes;

			if (shareDoc.type.name !== 'json') {
				throw new Error('ShareJS document must be of type "json"');
			}

			this.shareDoc = shareDoc;

			if (shareDoc.created) {
				attributes = this.toJSON();

				_.each(_.pairs(attributes), function(pair) {
					var k = pair[0], v = pair[1], t = type(v);

					if (t === 'boolean') {
						attributes[k] = v === true ? 1 : 0;
					}
				});

				shareDoc.submitOp([{p: this.documentPath, od: null, oi: attributes}]);
			}

			shareDoc.on('remoteop', function(ops) {
				_.each(ops, function(op, i) {
					if (_.isEqual(op.p, self.documentPath)) {
						this._handleOperation(op);
					}
				});
			});

			this.on("change", function(model, options) {
				if (!options || !options.local) {
					return self._sendModelChange(options);
				}
			});

			this.trigger('share:connected', this.shareDoc);
		},

		_sendModelChange: function() {
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
						//There is no boolean operation, so we use number add
						//TODO: Check that it actually changed, or else undo will get weird
						result.na = v ? 1 : -1;
						break;
					case 'object':
					case 'array':
						if (isBackboneModel(v)) {
							result.oi = v.toJSON();
						} else {
							result.oi = v;
						}
						break;
					case 'null':
					case 'undefined':
						if (isBackboneModel(prev)) {
							result.od = v.toJSON();
						} else {
							result.od = v;
						} 
						break;
					default:
						console.log('Ignoring attempt to send change on type ' + t);
						break;
				}

				return ops.push(result);
			});

			console.log('Sending:', ops);
			this.shareDoc.submitOp(ops, function(error, ops) {
				//self.shareDoc.submitOp(self.shareDoc.type.invert(ops), function() {
					console.log(arguments);
				//});
			});
		},

		_handleOperation: function (op) {
			if (this.isRoot && op.p.length <= 2) {
				if (op.si || op.sd) this._handleStringOperation(op);
				if (op.oi || op.od) this._handleObjectOperation(op);
				if (op.na) this._handleNumberOperation(op);
			} else {
				if (op.p === this.documentPath.join(':')) {
					throw new Error('Not implemented yet');
				}
			}
		},

		_handleStringOperation: function(op) {
			var original = this.get(op.p[0]),
				modified, deleted;

			if (op.si) {
				this.set(
					op.p[0], 
					original.splice(0, op.p[1]) + op.si + original.splice(op.p[1]),
					{local: true}
				);
			}

			if (op.sd) {
				deleted = original.splice(op.p[1], op.p[1] + op.sd.length);
				if (op.sd !== deleted) {
					throw new Error('Delete component ' + op.sd + ' does not match deleted text ' + deleted);
				}
				modified = original.splice(original.splice(0, op.p[1]) + original.splice(op.p[1] + op.sd.length));
				this.set(op.p[0], modified, {local: true});
			}
		},

		_handleObjectOperation: function(op) {
			var constructor = this.defaults[op.p[0]];
			if (op.oi) {
				if (constructor instanceof Backbone.Model ||
						constructor instanceof Backbone.Collection) {
					this.set(op.p[0], new constructor(op.oi), {local: true});
				} else {
					this.set(op.p[0], op.oi, {local: true});
				}
			} else {
				this.unset(op.p[0], {local: true});
			}
		},

		_handleNumberOperation: function(op) {
			var currentValue = this.get(op[0]);

			if (op.na > 0) {
				if (currentValue === true || currentValue === false) {
					this.get(op[0]).set(op.na === 1, {local: true});
				} else {
					this.get(op[0]).set(currentValue + op.na, {local: true});
				}
			}
		}
	});

	// Collection path should be a simple name?
	// Need to deal with non-roots
	// Need to deal with hooking up parents to children
	// Need to come up with undo-redo
	// Check paths on receiving ops
	// Need to validate models

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
				this.isRoot = false;
				this.initShareDoc(options.shareDoc);
			} else {
				this.isRoot = true;
				this.documentName = options.documentName || this.generateDocumentName();
				sharejs.open(this.documentName, 'json', function(err, doc) {
					if (err) throw err;

					console.log('Opened document "' + self.documentName + '"');
					self.initShareDoc(doc);
				});
			}
		},

		generateDocumentPath: function() {
			return [];
		},

		generateDocumentName: function() {
			return generateGUID();
		},

		initShareDoc: function(shareDoc) {
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