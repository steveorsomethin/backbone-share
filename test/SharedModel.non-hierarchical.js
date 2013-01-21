(function() {
	var TestModel = Backbone.SharedModel.extend({
		defaults: {
			strTest: 'abcdefg',
			boolTest: false,
			numTest: 50
		}
	});

	describe('SharedModel - non-hierarchical', function() {
		before(function(done) {
			new TestModel().share(function(error, root) {
				done();
			});
		});

		it('should emit si operation when adding text', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 7], si: 'hij'}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});
				
				model.set('strTest', 'abcdefghij');
				
			});
		});

		it('should emit si operations when making multiple identical text changes', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('strTest', 'abcdefgh');

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 8], si: 'h'}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'abcdefghh');
			});
		});

		it('should emit sd operation when deleting text', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 6], sd: 'g'}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'abcdef');
			});
		});

		it('should emit si and sd operations when replacing text', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 2], sd: 'cde'}, {p: ['strTest', 2 ], si: '123'}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('strTest', 'ab123fg');
			});
		});

		it('should emit oi and od operations when setting value to true', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['boolTest'], od: false, oi: true}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('boolTest', true);
			});
		});

		it('should emit oi and od operations when setting value to false', function(done) {
			new TestModel({boolTest: true}).share(function(error, root) {
				var model = this;

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['boolTest'], od: true, oi: false}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('boolTest', false);
			});
		});

		it('should emit positive na operation when increasing a number', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['numTest'], na: 50}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('numTest', 100);
			});
		});

		it('should emit negative na operation when decreasing a number', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['numTest'], na: -50}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.set('numTest', 0);
			});
		});

		it('should update on incoming si operation', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('strTest')).to.eql('abcdefghij');
					});
				});

				this._handleOperation({p: ['strTest', 7], si: 'hij'});
			});
		});

		it('should update on incoming sd operation', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('strTest')).to.eql('abefg');
					});
				});

				this._handleOperation({p: ['strTest', 2], sd: 'cd'});
			});
		});

		it('should update on incoming oi/od operation with true', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('boolTest')).to.eql(true);
					});
				});

				this._handleOperation({p: ['boolTest'], od: false, oi: true});
			});
		});

		it('should update on incoming oi/od operation with false', function(done) {
			new TestModel({boolTest: true}).share(function(error, root) {
				var model = this;

				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('boolTest')).to.eql(false);
					});
				});

				this._handleOperation({p: ['boolTest'], od: true, oi: false});
			});
		});

		it('should update on incoming positive na operation', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('numTest')).to.eql(100);
					});
				});

				this._handleOperation({p: ['numTest'], na: 50});
			});
		});

		it('should update on incoming negative na operation', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.on('change', function() {
					asyncAssert(done, function() {
						expect(model.get('numTest')).to.eql(0);
					});
				});

				this._handleOperation({p: ['numTest'], na: -50});
			});
		});

		it('should reset the undo stack on new operation', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('strTest', 'ab123fg');
				this.set('strTest', 'ab1234fg');
				this.undo();

				asyncAssert(done, function() {
					expect(model.get('strTest')).to.eql('ab123fg');
					expect(model.shareDoc.snapshot).to.eql(model.toJSON());

					model.set('strTest', 'abcdefghij');

					expect(model.get('strTest')).to.eql('abcdefghij');
					expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					
					expect(model.undoContext.stack).to.eql([
						[
							{p: ['strTest', 2], sd: 'cde'},
							{p: ['strTest', 2], si: '123'}
						],
						[
							{p: ['strTest', 2], sd: '123'},
							{p: ['strTest', 2], si: 'cde'},
							{p: ['strTest', 7], si: 'hij'}
						]
					]);
				});
			});
		});

		it('should emit sd operation on undo of si operation', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('strTest', 'abcdefghij');

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 7], sd: 'hij'}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
						expect(model.get('strTest')).to.eql('abcdefg');
					});
				});

				this.undo();
			});
		});

		it('should emit si operation on redo of si operation', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('strTest', 'abcdefghij');
				this.undo();

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 7], si: 'hij'}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
						expect(model.get('strTest')).to.eql('abcdefghij');
					});
				});

				this.redo();
			});
		});

		it('should emit si operation on undo of sd operation', function(done) {
			new TestModel({strTest: 'abcdefghij'}).share(function(error, root) {
				var model = this;

				this.set('strTest', 'abcdefg');

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 7], si: 'hij'}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
						expect(model.get('strTest')).to.eql('abcdefghij');
					});
				});

				this.undo();
			});
		});

		it('should emit sd operation on redo of sd operation', function(done) {
			new TestModel({strTest: 'abcdefghij'}).share(function(error, root) {
				var model = this;

				this.set('strTest', 'abcdefg');
				this.undo();

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 7], sd: 'hij'}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
						expect(model.get('strTest')).to.eql('abcdefg');
					});
				});

				this.redo();
			});
		});

		it('should emit sd and si operations on undo of string replace', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('strTest', 'ab123fg');

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 2 ], sd: '123'}, {p: ['strTest', 2 ], si: 'cde'}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
						expect(model.get('strTest')).to.eql('abcdefg');
					});
				});

				this.undo();
			});
		});

		it('should emit sd and si operations on redo of string replace', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('strTest', 'ab123fg');
				this.undo();

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['strTest', 2 ], sd: 'cde'}, {p: ['strTest', 2 ], si: '123'}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
						expect(model.get('strTest')).to.eql('ab123fg');
					});
				});

				this.redo();
			});
		});

		it('should emit od and oi operations on undo of boolean true', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('boolTest', true);

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['boolTest'], od: true, oi: false}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.undo();
			});
		});

		it('should emit od and oi operations on redo of boolean true', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('boolTest', true);
				this.undo();

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['boolTest'], od: false, oi: true}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.redo();
			});
		});

		it('should emit od and oi operations on undo of boolean false', function(done) {
			new TestModel({boolTest: true}).share(function(error, root) {
				var model = this;

				this.set('boolTest', false);

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['boolTest'], od: false, oi: true}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.undo();
			});
		});

		it('should emit od and oi operations on redo of boolean false', function(done) {
			new TestModel({boolTest: true}).share(function(error, root) {
				var model = this;

				this.set('boolTest', false);
				this.undo();

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['boolTest'], od: true, oi: false}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.redo();
			});
		});

		it('should emit positive na operation on undo of negative na', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('numTest', 0);

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['numTest'], na: 50}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.undo();
			});
		});

		it('should emit negative na operation on redo of negative na', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('numTest', 0);
				this.undo();

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['numTest'], na: -50}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.redo();
			});
		});

		it('should emit negative na operation on undo of positive na', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('numTest', 100);

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['numTest'], na: -50}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.undo();
			});
		});

		it('should emit positive na operation on redo of positive na', function(done) {
			new TestModel().share(function(error, root) {
				var model = this;

				this.set('numTest', 100);
				this.undo();

				model.shareDoc.on('change', function(ops) {
					asyncAssert(done, function() {
						expect(ops).to.eql([{p: ['numTest'], na: 50}]);
						expect(model.shareDoc.snapshot).to.eql(model.toJSON());
					});
				});

				this.redo();
			});
		});
	});
}).call(this);