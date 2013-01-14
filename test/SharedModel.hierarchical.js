var TestChildModel = Backbone.SharedModel.extend({
	defaults: {
		strTest: 'abcdefg',
		boolTest: false,
		numTest: 50
	}
});

var TestParentModel = Backbone.SharedModel.extend({
	defaults: function() {
		return {
			strTest: 'abcdefg',
			boolTest: false,
			numTest: 50,
			objTest: new TestChildModel({}, {
				parent: this, 
				documentPath: this.generateDocumentPath().concat(['objTest'])
			})
		};
	}
});

describe('SharedModel', function() {
	before(function(done) {
		new TestParentModel().get('objTest').on('share:connected', function(shareDoc) {
			done();
		});
	});

	describe('hierarchical', function() {
		it('should emit si operation when adding text', function(done) {
			new TestParentModel().get('objTest').on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest', 'strTest', 7], si: 'hij'}]);
						expect(shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'abcdefghij');
			});
		});

		it('should emit sd operation when deleting text', function(done) {
			new TestParentModel().get('objTest').on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest', 'strTest', 6], sd: 'g'}]);
						expect(shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'abcdef');
			});
		});

		it('should emit si and sd operations when replacing text', function(done) {
			new TestParentModel().get('objTest').on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([
							{p: ['objTest', 'strTest', 2], sd: 'cde'}, 
							{p: ['objTest', 'strTest', 2], si: '123'}
						]);
						expect(shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'ab123fg');
			});
		});

		it('should emit oi and od operations when setting value to true', function(done) {
			new TestParentModel().get('objTest').on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest', 'boolTest'], od: false, oi: true}]);
						expect(shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('boolTest', true);
			});
		});

		it('should emit positive na operation when increasing a number', function(done) {
			new TestParentModel().get('objTest').on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest', 'numTest'], na: 50}]);
						expect(shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('numTest', 100);
			});
		});

		it('should emit positive na operation when decreasing a number', function(done) {
			new TestParentModel().get('objTest').on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest', 'numTest'], na: -50}]);
						expect(shareDoc.snapshot.objTest).to.eql(model.toJSON());
					});
				});

				this.set('numTest', 0);
			});
		});

		it('should emit oi operation when setting a child SharedModel', function(done) {
			new TestParentModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest2'], oi: model.get('objTest2').toJSON()}]);
						expect(shareDoc.snapshot.objTest2).to.eql(model.get('objTest2').toJSON());
					});
				});

				this.set('objTest2', new TestChildModel({}, {
					parent: this,
					documentPath: this.generateDocumentPath().concat(['objTest2'])
				}));
			});
		});

		it('should emit od operation when unsetting a child SharedModel', function(done) {
			new TestParentModel().on('share:connected', function(shareDoc) {
				var model = this;
				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest'], od: model.previous('objTest').toJSON()}]);
						expect(shareDoc.snapshot.objTest).to.eql(undefined);
					});
				});

				this.unset('objTest');
			});
		});

		it('should emit oi and od operations when replacing a child SharedModel', function(done) {
			new TestParentModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{
							p: ['objTest'], 
							oi: model.get('objTest').toJSON(),
							od: model.previous('objTest').toJSON()
						}]);
						expect(shareDoc.snapshot.objTest).to.eql(model.get('objTest').toJSON());
					});
				});

				this.set('objTest', new TestChildModel({}, {
					parent: this,
					documentPath: this.generateDocumentPath().concat(['objTest'])
				}));
			});
		});

		it('should emit oi operation when setting a child JS object', function(done) {
			new TestParentModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest2'], oi: model.get('objTest2')}]);
						expect(shareDoc.snapshot.objTest2).to.eql(model.get('objTest2'));
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
			}).on('share:connected', function(shareDoc) {
				var model = this;
				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['objTest'], od: model.previous('objTest')}]);
						expect(shareDoc.snapshot.objTest).to.eql(undefined);
					});
				});

				this.unset('objTest');
			});
		});

		it('should emit oi and od operations when replacing a child JS object', function(done) {
			new TestParentModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{
							p: ['objTest'], 
							oi: model.get('objTest'),
							od: model.previous('objTest').toJSON()
						}]);
						expect(shareDoc.snapshot.objTest).to.eql(model.get('objTest'));
					});
				});

				this.set('objTest', new TestChildModel({}, {
					parent: this,
					documentPath: this.generateDocumentPath().concat(['objTest'])
				}).toJSON());
			});
		});
	});
});