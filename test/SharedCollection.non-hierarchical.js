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

	describe('SharedCollection - non-hierarchical', function() {
		before(function(done) {
			new TestCollection().share(function(error, root) {
				done();
			});
		});

		it('should emit li operations when adding models', function(done) {
			new TestCollection().share(function(error, root) {
				var collection = this,
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()];

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql(newModels.map(
							function(model, i) {
								return {
									p: [i],
									li: model.toJSON()
								};
							})
						);
						expect(collection.shareDoc.snapshot).to.eql(collection.toJSON());
					});
				});

				this.add(newModels);
			});
		});

		it('should emit ld operations on undo of adding models', function(done) {
			new TestCollection().share(function(error, root) {
				var collection = this,
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()];

				this.add(newModels);

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops.reverse()).to.eql(newModels.map(
							function(model, i) {
								return {
									p: [i],
									ld: model.toJSON()
								};
							})
						);
						expect(collection.shareDoc.snapshot).to.eql(collection.toJSON());
					});
				});

				this.undo();
			});
		});

		it('should emit li operations on redo of adding models', function(done) {
			new TestCollection().share(function(error, root) {
				var collection = this,
					newModels = [new TestChildModel(), new TestChildModel(), new TestChildModel()];

				this.add(newModels);
				this.undo();

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql(newModels.map(
							function(model, i) {
								return {
									p: [i],
									li: model.toJSON()
								};
							})
						);
						expect(collection.shareDoc.snapshot).to.eql(collection.toJSON());
					});
				});

				this.redo();
			});
		});

		it('should emit ld operations when removing models', function(done) {
			new TestCollection([new TestChildModel(), new TestChildModel(), new TestChildModel()]).share(function(error, root) {
				var collection = this,
					models = this.toJSON();

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops.reverse()).to.eql(models.map(
							function(model, i) {
								return {
									p: [i],
									ld: model
								};
							})
						);
						expect(collection.shareDoc.snapshot).to.eql([]);
					});
				});

				this.remove(this.models);
			});
		});

		it('should emit li operations on undo of removing models', function(done) {
			new TestCollection([new TestChildModel(), new TestChildModel(), new TestChildModel()]).share(function(error, root) {
				var collection = this,
					models = this.toJSON();

				this.remove(this.models);

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql(models.map(
							function(model, i) {
								return {
									p: [i],
									li: model
								};
							})
						);
						expect(collection.shareDoc.snapshot).to.eql(collection.toJSON());
					});
				});

				this.undo();
			});
		});

		it('should emit ld operations on redo of removing models', function(done) {
			new TestCollection([new TestChildModel(), new TestChildModel(), new TestChildModel()]).share(function(error, root) {
				var collection = this,
					models = this.toJSON();

				this.remove(this.models);
				this.undo();

				this.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops.reverse()).to.eql(models.map(
							function(model, i) {
								return {
									p: [i],
									ld: model
								};
							})
						);
						expect(collection.shareDoc.snapshot).to.eql(collection.toJSON());
					});
				});

				this.redo();
			});
		});

		it('should add elements on incoming li operation', function(done) {
			new TestCollection([new TestChildModel(), new TestChildModel()]).share(function(error, root) {
				var collection = this,
					newModel = new TestChildModel();

				this.on('add', function() {
					asyncAssert(done, function() {
						expect(collection.at(1).toJSON()).to.eql(newModel.toJSON());
					});
				});

				this.shareDoc.emit('remoteop', [{p: [1], li: newModel.toJSON()}]);
			});
		});

		it('should remove elements on incoming ld operation', function(done) {
			new TestCollection([new TestChildModel(), new TestChildModel()]).share(function(error, root) {
				var collection = this,
					model = this.at(1);

				this.on('remove', function() {
					asyncAssert(done, function() {
						expect(collection.length).to.eql(1);
						expect(collection.at(0).toJSON()).to.eql(model.toJSON());
					});
				});

				this.shareDoc.emit('remoteop', [{p: [0], ld: this.at(0).toJSON()}]);
			});
		});
	});
}).call(this);