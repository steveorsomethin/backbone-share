var express = require('express'),
	sharejs = require('share').server,
	app = express.createServer();

sharejs.attach(app);

app.model.on('applyOp', function(docName, opData, snapshot, oldSnapshot) {
	console.log(arguments);
});

app.use('/test', express.static(__dirname));
app.use('/deps', express.static(__dirname + '/../deps'));
app.use('/build', express.static(__dirname+ '/../build'));

app.model.on('applyOp', function(docName, opData, snapshot, oldSnapshot) {
	console.log(arguments);
});

app.listen(8080); //TODO: Make this an argument