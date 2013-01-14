var TestModel = Backbone.SharedModel.extend({
	defaults: {
		strTest: '',
		boolTest: false,
		numTest: 0
	}
});

//Workaround due to mocha not quite liking browser async tests
//See: https://github.com/visionmedia/mocha/pull/278
var asyncAssert = function(done, assertFunc) {
	try {
		assertFunc.call();
	} catch (error) {
		return done(error);
	}

	return done();
};

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
						expect(ops).to.eql([{p: ['strTest', 0], si: 'abc'}]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'abc');
			});
		});

		it('should emit sd operation when deleting text', function(done) {
			new TestModel({strTest: 'abc'}).on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 2], sd: 'c'}]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'ab');
			});
		});

		it('should emit si and sd operations when replacing text', function(done) {
			new TestModel({strTest: 'abcdefg'}).on('share:connected', function(shareDoc) {
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

		it('should emit na operation of 1 when setting value to true', function(done) {
			new TestModel().on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['boolTest'], na: 1}]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('boolTest', true);
			});
		});

		it('should emit na operation of -1 when setting value to false', function(done) {
			new TestModel({boolTest: true}).on('share:connected', function(shareDoc) {
				var model = this;

				shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['boolTest'], na: -1}]);
						expect(shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('boolTest', false);
			});
		});
	});
});