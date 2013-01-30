(function() {
	var TestChildModel = Backbone.SharedModel.extend({
		defaults: {
			strTest: 'abcdefg',
			boolTest: false,
			numTest: 50
		}
	});

	var TestCollection = Backbone.SharedCollection.extend({
		model: TestChildModel
	});

	var TestParentModel = Backbone.SharedModel.extend({
		defaults: function() {
			return {
				strTest: 'abcdefg',
				boolTest: false,
				numTest: 50,
				collectionTest: new TestCollection()
			};
		}
	});

	describe('SharedCollection - hierarchical', function() {
		before(function(done) {
			new TestParentModel().get('collectionTest').share(function(error, root) {
				done();
			});
		});

		it('should emit li operations when adding models', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()];

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql(newModels.map(
							function(model, i) {
								return {
									p: ['collectionTest', i],
									li: model.toJSON()
								};
							})
						);
						expect(model.shareDoc.snapshot.collectionTest).to.eql(collection.toJSON());
					});
				});

				collection.add(newModels);
			});
		});

		it('should emit ld operations on undo of adding models', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()];

				collection.add(newModels);

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops.reverse()).to.eql(newModels.map(
							function(model, i) {
								return {
									p: ['collectionTest', i],
									ld: model.toJSON()
								};
							})
						);
						expect(model.shareDoc.snapshot.collectionTest).to.eql(collection.toJSON());
					});
				});

				this.undo();
			});
		});

		it('should emit li operations on redo of adding models', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()];

				collection.add(newModels);
				this.undo();

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql(newModels.map(
							function(model, i) {
								return {
									p: ['collectionTest', i],
									li: model.toJSON()
								};
							})
						);
						expect(model.shareDoc.snapshot.collectionTest).to.eql(collection.toJSON());
					});
				});

				this.redo();
			});
		});

		it('should emit ld operations when removing models', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()];

				collection.add(newModels);

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops.reverse()).to.eql(newModels.map(
							function(model, i) {
								return {
									p: ['collectionTest', i],
									ld: model.toJSON()
								};
							})
						);
						expect(model.shareDoc.snapshot.collectionTest).to.eql([]);
					});
				});

				collection.remove(newModels);
			});
		});

		it('should emit li operations on undo of removing models', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()];

				collection.add(newModels);

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql(newModels.map(
							function(model, i) {
								return {
									p: ['collectionTest', i],
									ld: model.toJSON()
								};
							}).reverse()
						);
						expect(model.shareDoc.snapshot.collectionTest).to.eql(collection.toJSON());
					});
				});

				this.undo();
			});
		});

		it('should emit ld operations on redo of removing models', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()];

				collection.add(newModels);
				collection.remove(newModels);
				this.undo();

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops.reverse()).to.eql(newModels.map(
							function(model, i) {
								return {
									p: ['collectionTest', i],
									ld: model.toJSON()
								};
							})
						);
						expect(model.shareDoc.snapshot.collectionTest).to.eql(collection.toJSON());
					});
				});

				this.redo();
			});
		});

		it('should undo multiple operations when grouping undo', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()],
					originalState = this.toJSON();

				this.groupUndoOps(function() {
					collection.add(newModels);
					collection.at(0).set('strTest', '12345');
					this.set('boolTest', true);
					this.set('numTest', 300);
				});

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([
							{p: ['numTest'], na: -250},
							{p: ['boolTest'], od: true, oi: false},
							{p: ['collectionTest', 0, 'strTest', 0], sd: '12345'},
							{p: ['collectionTest', 0, 'strTest', 0], si: 'abcdefg'},
							{p: ['collectionTest', 2], ld: newModels[2].toJSON()},
							{p: ['collectionTest', 1], ld: newModels[1].toJSON()},
							{p: ['collectionTest', 0], ld: newModels[0].toJSON()}
						]);
						expect(model.shareDoc.snapshot).to.eql(originalState);
					});
				});

				this.undo();
			});
		});

		it('should redo multiple operations when grouping undo', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()],
					jsonModels = newModels.map(function(model) {return model.toJSON();}),
					originalState;

				this.groupUndoOps(function() {
					collection.add(newModels);
					collection.at(0).set('strTest', '12345');
					this.set('boolTest', true);
					this.set('numTest', 300);
				});

				originalState = this.toJSON();

				this.undo();

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([
							{p: ['collectionTest', 0], li: jsonModels[0]},
							{p: ['collectionTest', 1], li: jsonModels[1]},
							{p: ['collectionTest', 2], li: jsonModels[2]},
							{p: ['collectionTest', 0, 'strTest', 0], sd: 'abcdefg'},
							{p: ['collectionTest', 0, 'strTest', 0], si: '12345'},
							{p: ['boolTest'], od: false, oi: true},
							{p: ['numTest'], na: 250},
						]);
						expect(model.shareDoc.snapshot).to.eql(originalState);
					});
				});

				this.redo();
			});
		});

		it('should not modify the undo stack when preventing undo', function() {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()];

				this.preventUndo(function() {
					collection.add(newModels);
					collection.at(0).set('strTest', '12345');
					this.set('boolTest', true);
					this.set('numTest', 300);
				});

				expect(this.undoContext.stack.length).to.eql(0);
			});
		});

		it('should add elements on incoming li operation', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModel = new TestChildModel(),
					newModels = [new TestChildModel(), new TestChildModel()];

				collection.add(newModels);

				collection.on('add', function() {
					asyncAssert(done, function() {
						expect(collection.at(1).toJSON()).to.eql(newModel.toJSON());
					});
				});

				collection.shareDoc.emit('remoteop', [{p: ['collectionTest', 1], li: newModel.toJSON()}]);
			});
		});

		it('should remove elements on incoming ld operation', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModels = [new TestChildModel(), new TestChildModel()],
					targetModel = newModels[1];

				collection.add(newModels);

				collection.on('remove', function() {
					asyncAssert(done, function() {
						expect(collection.length).to.eql(1);
						expect(collection.at(0).toJSON()).to.eql(targetModel.toJSON());
					});
				});

				collection.shareDoc.emit('remoteop', [{p: ['collectionTest', 0], ld: collection.at(0).toJSON()}]);
			});
		});

		it('should clean up when unsharing', function(done) {
			var parentModel = new TestParentModel();
			parentModel.share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModel = new TestChildModel();

				collection.add(newModel);
				newModel.set('strTest', 'abcdefghij');

				parentModel.unshare();

				asyncAssert(done, function() {
					expect(parentModel.shareDoc).to.eql(null);
				});
			});
		});

		it('should reopen an existing model and initialize', function(done) {
			var parentModel = new TestParentModel();
			parentModel.share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModel = new TestChildModel();

				collection.add(newModel);
				newModel.set('strTest', 'abcdefghij');

				parentModel.unshare();

				var newParentModel = new TestParentModel({id: parentModel.get('id')});
				newParentModel.share(function(error, root) {
					asyncAssert(done, function() {
						expect(parentModel.toJSON()).to.eql(newParentModel.toJSON());
					});
				});
			});
		});

		it('should send all changes on connection', function(done) {
			var parentModel = new TestParentModel(),
				collection = parentModel.get('collectionTest'),
				newModel = new TestChildModel();

			collection.add(newModel);
			newModel.set('strTest', 'abcdefghij');
			parentModel.share(function(error, root) {
				asyncAssert(done, function() {
					expect(parentModel.toJSON()).to.eql(parentModel.shareDoc.snapshot);
				});
			});
		});

		it('should emit si operation when adding text', function(done) {
			new TestParentModel().share(function(error, root) {
				var model = this,
					collection = this.get('collectionTest'),
					newModel = new TestChildModel();

				collection.add(newModel);

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{
							p: ['collectionTest', 0, 'strTest', 7],
							si: 'hij'
						}]);
						expect(model.shareDoc.snapshot.collectionTest[0]).to.eql(newModel.toJSON());
					});
				});

				newModel.set('strTest', 'abcdefghij');
			});
		});


	});
}).call(this);