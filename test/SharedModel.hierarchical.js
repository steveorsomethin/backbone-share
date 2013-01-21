(function() {
	var TestChildModel = Backbone.SharedModel.extend({
		defaults: {
			strTest: 'abcdefg',
			boolTest: false,
			numTest: 50
		}
	});

	var TestParentModel = Backbone.SharedModel.extend({
		subDocTypes: {
			objTest: TestChildModel
		},

		defaults: function() {
			return {
				strTest: 'abcdefg',
				boolTest: false,
				numTest: 50,
				objTest: new TestChildModel()
			};
		}
	});

	describe('SharedModel - hierarchical', function() {
		before(function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				done();
			});
		});

		it('should emit si operation when adding text', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest', 'strTest', 7], si: 'hij'}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'abcdefghij');
			});
		});

		it('should emit sd operation when deleting text', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest', 'strTest', 6], sd: 'g'}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'abcdef');
			});
		});

		it('should emit si and sd operations when replacing text', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([
							{p: ['objTest', 'strTest', 2], sd: 'cde'}, 
							{p: ['objTest', 'strTest', 2], si: '123'}
						]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'ab123fg');
			});
		});

		it('should emit oi and od operations when setting value to true', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest', 'boolTest'], od: false, oi: true}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('boolTest', true);
			});
		});

		it('should emit positive na operation when increasing a number', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest', 'numTest'], na: 50}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('numTest', 100);
			});
		});

		it('should emit positive na operation when decreasing a number', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest', 'numTest'], na: -50}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});
				console.log(this)
				this.set('numTest', 0);
			});
		});

		it('should emit oi operation when setting a child SharedModel', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest2'], oi: model.get('objTest2').toJSON()}]);
						expect(model.shareDoc.snapshot.objTest2).to.eql(model.get('objTest2').toJSON());
					});
				});

				this.set('objTest2', new TestChildModel({}, {
					parent: this,
					documentPath: this.generateDocumentPath().concat(['objTest2'])
				}));
			});
		});

		it('should emit od operation when unsetting a child SharedModel', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest'], od: model.previous('objTest').toJSON()}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(undefined);
					});
				});

				this.unset('objTest');
			});
		});

		it('should emit oi and od operations when replacing a child SharedModel', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{
							p: ['objTest'], 
							oi: model.get('objTest').toJSON(),
							od: model.previous('objTest').toJSON()
						}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.get('objTest').toJSON());
					});
				});

				this.set('objTest', new TestChildModel({}, {
					parent: this,
					documentPath: this.generateDocumentPath().concat(['objTest'])
				}));
			});
		});

		it('should emit oi operation when setting a child JS object', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest2'], oi: model.get('objTest2')}]);
						expect(model.shareDoc.snapshot.objTest2).to.eql(model.get('objTest2'));
					});
				});

				this.set('objTest2', new TestChildModel({}, {
					parent: this,
					documentPath: this.generateDocumentPath().concat(['objTest2'])
				}).toJSON());
			});
		});

		it('should emit od operation when unsetting a child JS object', function(done) {
			new TestParentModel({
				objTest: new TestChildModel().toJSON()
			}).share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest'], od: model.previous('objTest')}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(undefined);
					});
				});

				this.unset('objTest');
			});
		});

		it('should emit oi and od operations when replacing a child JS object', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this;
				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{
							p: ['objTest'], 
							oi: model.get('objTest'),
							od: model.previous('objTest').toJSON()
						}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.get('objTest'));
					});
				});

				this.set('objTest', new TestChildModel({}, {
					parent: this,
					documentPath: this.generateDocumentPath().concat(['objTest'])
				}).toJSON());
			});
		});

		it('should update on incoming si operation', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('strTest')).to.eql('abcdefghij');
					});
				});

				this.shareDoc.emit('remoteop', [{p: ['objTest', 'strTest', 7], si: 'hij'}]);
			});
		});

		it('should update on incoming sd operation', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('strTest')).to.eql('abefg');
					});
				});

				this.shareDoc.emit('remoteop', [{p: ['objTest', 'strTest', 2], sd: 'cd'}]);
			});
		});

		it('should update on incoming oi/od operation with true', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('boolTest')).to.eql(true);
					});
				});

				this.shareDoc.emit('remoteop', [{p: ['objTest', 'boolTest'], od: false, oi: true}]);
			});
		});

		it('should update on incoming oi/od operation with false', function(done) {
			new TestParentModel({
				objTest: new TestChildModel({boolTest: true})
			}).get('objTest').share(function(error, root) {
				var model = this;
				model.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('boolTest')).to.eql(false);
					});
				});

				this.shareDoc.emit('remoteop', [{p: ['objTest', 'boolTest'], od: true, oi: false}]);
			});
		});

		it('should update on incoming positive na operation', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('numTest')).to.eql(100);
					});
				});

				this.shareDoc.emit('remoteop', [{p: ['objTest', 'numTest'], na: 50}]);
			});
		});

		it('should update on incoming negative na operation', function(done) {
			new TestParentModel().get('objTest').share(function(error, root) {
				var model = this;
				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('numTest')).to.eql(0);
					});
				});

				this.shareDoc.emit('remoteop', [{p: ['objTest', 'numTest'], na: -50}]);
			});
		});

		it('should update on incoming oi operation with SharedModel', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this;
				var newModel = new TestChildModel();

				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('objTest').toJSON()).to.eql(newModel.toJSON());
					});
				});

				this.shareDoc.emit('remoteop', [{
					p: ['objTest'],
					oi: newModel.toJSON()
				}]);
			});
		});

		it('should update on incoming od operation with SharedModel', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this;
				var newModel = new TestChildModel();

				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('objTest')).to.eql(undefined);
					});
				});

				this.shareDoc.emit('remoteop', [{
					p: ['objTest'],
					od: this.get('objTest').toJSON(),
				}]);
			});
		});

		it('should emit od and oi operations on undo of setting a SharedModel', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					newModel = new TestChildModel();

				this.set('objTest', newModel);

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{
							p: ['objTest'],
							od: newModel.toJSON(),
							oi: model.get('objTest').toJSON()
						}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.get('objTest').toJSON());
					});
				});

				this.undo();
			});
		});

		it('should emit od and oi operations on redo of setting a SharedModel', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					newModel = new TestChildModel();

				this.set('objTest', newModel);
				this.undo();
				newModel = this.get('objTest');

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{
							p: ['objTest'],
							od: newModel.toJSON(),
							oi: model.get('objTest').toJSON()
						}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.get('objTest').toJSON());
					});
				});

				this.redo();
			});
		});

		it('should emit oi operation on undo of unsetting a SharedModel', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this;

				this.unset('objTest');

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{
							p: ['objTest'],
							oi: model.get('objTest').toJSON()
						}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(model.get('objTest').toJSON());
					});
				});

				this.undo();
			});
		});

		it('should emit od operation on redo of unsetting a SharedModel', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					oldModel = this.get('objTest');

				this.unset('objTest');
				this.undo();

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{
							p: ['objTest'],
							od: oldModel.toJSON()
						}]);
						expect(model.shareDoc.snapshot.objTest).to.eql(undefined);
					});
				});

				this.redo();
			});
		});
	});
}).call(this);