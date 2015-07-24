var cluster = require('cluster');
var os = require('os');
var net = require('net');

var lg = require(__dirname+'/loger.js');
var loger = new lg(__filename);

if(cluster.isMaster){
	var server = net.createServer(function(socket){
		socket.on('data', function(data){
			console.dir(data.toString());
			switch(data.toString()){
				case 'help\r\n':
					socket.write('Valid Command: pids, reload\r\n');
				case 'reload\r\n':
					break;
				case 'pids\r\n':
					socket.write("Showing Pids:\r\n");
					socket.write("----------------\r\n");
					for (var id in cluster.workers) {
						socket.write(cluster.workers[id].process.pid+',');
					}
					socket.write('\r\n');
					break;
				case 'db ref\r\n':
					/*
					cluster.workers.forEach(function(w){
						w.send(socket);
					});
					*/
					for (var id in cluster.workers) {
						cluster.workers[id].send('Hello', socket);
					}
					break;
				case 'exit\r\n':
					socket.end("diconnected\n");
				default:
					socket.write("Uknow Command\r\n");
					break;
			}
		});
	});

	
	server.listen(9090, 'localhost');
	loger.log("tcp://localhost:9090");

	for(var i=0;i<os.cpus().length;i++){
		cluster.fork();
	}

	cluster.on('exit', function(worker){
		console.dir(worker);
		setTimeout(function(){
			cluster.fork();
		}, 2000);
	});
}else {
	var app = require(__dirname+'/index.js');
}