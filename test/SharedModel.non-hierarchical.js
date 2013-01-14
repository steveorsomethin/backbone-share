var TestModel = Backbone.SharedModel.extend({
	defaults: {
		strTest: 'abcdefg',
		boolTest: false,
		numTest: 50
	}
});

describe('SharedModel', function() {
	before(function(done) {
		new TestModel().on('share:connected', function(shareDoc) {
			done();
		});
	});

	describe('non-hierarchical', function() {
		it('should emit si operation when adding text', function(done) {
			new TestModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 7], si: 'hij'}]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'abcdefghij');
			});
		});

		it('should emit sd operation when deleting text', function(done) {
			new TestModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 6], sd: 'g'}]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'abcdef');
			});
		});

		it('should emit si and sd operations when replacing text', function(done) {
			new TestModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([ { p: [ 'strTest', 2 ], sd: 'cde' }, { p: [ 'strTest', 2 ], si: '123' } ]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'ab123fg');
			});
		});

		it('should emit oi and od operations when setting value to true', function(done) {
			new TestModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['boolTest'], od: false, oi: true}]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('boolTest', true);
			});
		});

		it('should emit oi and od operations when setting value to false', function(done) {
			new TestModel({boolTest: true}).on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['boolTest'], od: true, oi: false}]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('boolTest', false);
			});
		});

		it('should emit positive na operation when increasing a number', function(done) {
			new TestModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['numTest'], na: 50}]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('numTest', 100);
			});
		});

		it('should emit negative na operation when decreasing a number', function(done) {
			new TestModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['numTest'], na: -50}]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('numTest', 0);
			});
		});

		it('should update on incoming si operation', function(done) {
			new TestModel().on('share:connected', function(shareDoc) {
				var model = this;

				this.on('change', function() {
					asyncAssert(done, function() {
						console.log(arguments, model);
					});
				});

				this._handleOperation({
					p: ['strTest', 7], si: 'hij'
				});
			});
		});
	});
});