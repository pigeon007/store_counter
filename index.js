var csv = require('csv');
var fs = require('fs');
var lg = require(__dirname+'/loger.js');
var loger = new lg(__filename);

var express = require('express');
var session = require('express-session');
var app = express();

var mysql = require('mysql');
var node_uuid = require('node-uuid');
var formidable = require('formidable');

var RedisStore = require('connect-redis')(session);
var bodyParser = require('body-parser');

var im = require('imagemagick');

app.use(session({
    secret: 'mljkqdmkljqsdmfjkdsqmfkljqsfdlmkjqsdfmklj',
    name: 'mljkqfdmkljsqdfmkljsqdfmj',
    resave:false,
    saveUninitialized: true,
    store:new RedisStore({host:'127.0.0.1', port:6379})
}));

var mysqlConnection = mysql.createConnection({
        host:'localhost',
        user:'root',
        password:'',
        database:'estore'
});

var mysqlThreadId;

mysqlConnection.connect(function(err) {
  if (err) {
        loger.error('error connecting: ' + err.stack);
    return;
  }
  mysqlThreadId = mysqlConnection.threadId;
  loger.log('connected  To MySQL With id: ' + mysqlConnection.threadId);
});

process.on('message', function(msg, socket){
	console.dir(socket);
	//socket.write(mysqlThreadId);
});

function validate_image(mime_type, callback){
	var valide_extension = ["image/jpg", "image/png", "image/gif", "image/jpeg"];
	if(valide_extension.indexOf(mime_type)!=-1){
		callback(null);
	}else {
		callback(1);
	}
}

function clean_temp(file){
	fs.exists(file, function(bool){
      	if(bool){
            fs.unlink(file, function(err){
                if(err){
                    loger.log(err);
                }
            });
        }
    });
}


app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(bodyParser.raw({ extended: false }));
app.use(bodyParser.text({ extended: false }));

app.use(express.static(__dirname+'/public/css'));
app.use(express.static(__dirname+'/public/js'));
app.use(express.static(__dirname+'/public/font'));
app.use(express.static(__dirname+'/public/img'));

app.get('/login', function(req, res){
	res.sendFile(__dirname+'/templates/login.html');
});

app.post('/login', function(req, res){
	var uuid = node_uuid.v1();
	var password = req.body.password;
	var name = req.body.username;
	// need to add bcrypt support for the password
	var query = 'select * from users where username=? and password=?';

	var sess = req.session;
	
	mysqlConnection.query(query, [name, password], function(err, rows, fields){
		if(err){
			res.end("select mysql error");
		}else {
			if(rows.length==0){
				var msg = {
					status:"ERR",
					msg:"user not found"
				};
				res.send(msg);
			}else {
				//loger.log("yes found");
				var session_uuid = node_uuid.v1();
				sess.sid = session_uuid;
				sess.name = name;
				sess.uuid = rows[0].uuid;
				res.redirect('/');
			}
		}
	});
});

app.post('/update/password', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		if(req.body.old_password!="" && req.body.password!="" && req.body.password1!="" && (req.body.password==req.body.password1)){
			var query = 'select password from users where uuid=?';
			mysqlConnection.query(query, [req.session.uuid], function(err, rows, fields){
				if(err){
					var msg = {
						status:"ERR",
						msg:"unable to select"
					};
					res.send(msg);
				}else {
					if(rows[0].password==req.body.old_password){
						var query1 = 'update users set password=? where uuid=?';
						mysqlConnection.query(query1, [req.body.password, req.session.uuid], function(err, update_res){
							if(err){
								var msg = {
									status:"ERR",
									msg:"unable to select"
								};
								res.send(msg);
							}else {
								req.session.destroy(function(err) {
							  		// cannot access session here
									if(err){
										var msg = {
											status:"ERR",
											msg:"unable to logout"
										};
										res.send(msg);
									}else {
										res.redirect('/login');
									}
								});
							}
						});
					}else {
						var msg = {
							status:"ERR",
							msg:"old password error"
						};
						res.send(msg);
					}
				}
			});
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid password"
			};
			res.send(msg);
		}
	}
});

app.post('/update/user', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		if(req.body.name!="" && req.body.address!="" && req.body.phone!=""){
			var query = 'update users set password=?, name=?, address=?, phone=?';
			mysqlConnection.query(query, [req.body.password, req.body.name, req.body.address, req.body.phone], function(err, update_res){
				if(err){
					var msg = {
						status:"ERR",
						msg:"unable to update"
					};
					res.send(msg);
				}else {
					var msg = {
						status:"OK",
						msg:"updated"
					};
					res.send(msg);
				}
			});
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid password"
			};
			res.send(msg);
		}
	}
});

app.get('/users/info', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		var query = 'select name, address, username, email, created, updated, phone from users where uuid=?';
		mysqlConnection.query(query, [req.session.uuid], function(err, rows, fields){
			if(err){
				var msg = {
					status:"ERR",
					msg:"unable to select"
				};
				res.send(msg);
			}else {
				var msg = {
					status:"OK",
					msg:rows
				};
				res.send(msg);
			}
		});
	}
});

app.get('/logout', function(req, res){
	req.session.destroy(function(err) {
  		// cannot access session here
		if(err){
			var msg = {
				status:"ERR",
				msg:"unable to logout"
			};
			res.send(msg);
		}else {
			res.redirect('/login');
		}
	});
});


// store logic

app.post('/store', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		var query = 'insert into stores (uuid, name, address, phone, created, updated, users_uuid) values (?, ?, ?, ?, ?, ?, ?);';
		if(req.body.name!=undefined && req.body.address!=undefined && req.body.phone!=undefined){
			mysqlConnection.query(query, [node_uuid.v1(), req.body.name, req.body.address, req.body.phone, new Date(), new Date(), req.session.uuid], function(err, insert_res){
				if(err){
					var msg = {
						status:"ERR",
						msg:"unable to insert"
					};
					res.send(msg);
				}else {
					var msg = {
						status:"OK",
						msg:"store inserted"
					};
					res.send(msg);
				}
			});
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid store post"
			};
			res.send(msg);
		}
	}
});

app.post('/update/store/:uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		console.dir(req.body);
		var query = 'update stores inner join users on stores.users_uuid=users.uuid and users.uuid=? set stores.name=?, stores.address=?, stores.phone=?, stores.updated=? where stores.uuid=?';
		if(req.body.name!=undefined && req.body.address!=undefined && req.body.phone!=undefined && req.params.uuid!=""){
			mysqlConnection.query(query, [req.session.uuid, req.body.name, req.body.address, req.body.phone, new Date(), req.params.uuid], function(err, insert_res){
				if(err){
					var msg = {
						status:"ERR",
						msg:err
					};
					res.send(msg);
				}else {
					var msg = {
						status:"OK",
						msg:"store updated"
					};
					res.send(msg);
				}
			});
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid store post"
			};
			res.send(msg);
		}
	}
});

app.get('/update/store/:uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		res.sendFile(__dirname+'/templates/update_store.html');
	}
});

app.post('/update/products/:uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		var form = new formidable.IncomingForm();
		form.maxFieldsSize = 2 * 1024 * 1024;
		form.parse(req, function(err, fields, files) {
	    	if(err){
	    		var msg = {
	    			status:"ERR",
	    			msg:"unable to upload"
	    		};
	    		res.send(msg)
	    		// clean /temp
	    		clean_temp(files.upload.path);
	    	}else {
	    		fs.exists(files.upload.path, function(bool){
	    			if(bool){
	    				if(files.upload.name!=''){
		    							var name = '/tmp/'+files.upload.name+'-small';
					    				im.convert([files.upload.path, '-resize', '221x440', name], function(err, stdout){
	                                        if(err){
	                                       		clean_temp(name);
	                                        	clean_temp(files.upload.path);
	                                            var msg = {
	                                            	status:"ERR",
	                                            	msg:"make miniature error"
	                                            };
	                                            res.send(msg);
	                                        }else {
	                                        	fs.readFile(name, function(err, blob){
							    					if(err){
							    						var msg = {
							    							status:"ERR",
							    							msg:"unable to readFile"
							    						};
							    						res.send(msg);
							    						clean_temp(name);
							    						clean_temp(files.upload.path);
							    					}else {
							    						if(fields.name!="" && fields.price!="" && 
							    							fields.currency!="" && fields.number!="" && fields.store!=""){
							    							// a revoire avec inner join
							    							var query = 'update products set name=?, price=?, currency=?, image=?, type=?, size=?, number=?, updated=? where uuid=?';
															var uuid = node_uuid.v1();
															mysqlConnection.query(query, [fields.name, fields.price, fields.currency, blob, files.upload.type, files.upload.size, fields.number, new Date(), req.params.uuid], function(err, update_res){
																if(err){
																	var msg = {
																		status:"ERR",
																		msg:err
																	};
																	res.send(msg);
																	clean_temp(name);
																	clean_temp(files.upload.path);
																}else {
																	/*
																	var msg = {
																		status:"OK",
																		msg:"updated"
																	};
																	res.send(msg);
																	*/
																	res.redirect('/');
																	clean_temp(name);
																	clean_temp(files.upload.path);
																}
															});
							    						}else {
							    							var msg = {
							    								status:"ERR",
							    								msg:"invalid data"
							    							};
							    							res.send(msg);
							    							clean_temp(name);
															clean_temp(files.upload.path);
							    						}
							    					}
							    				});
											}
                                        });
		    			}else {
		    				// update inner join
		    				console.log("pas dimage");
		    				console.log(fields);
		    				var query = 'update products set name=?, price=?, currency=?, type=?, size=?, number=?, updated=? where uuid=?';
							mysqlConnection.query(query, [fields.name, fields.price, fields.currency, files.upload.type, files.upload.size, fields.number, new Date(), req.params.uuid], function(err, update_res){
								if(err){
									var msg = {
										status:"ERR",
										msg:err
									};
									res.send(msg);
									clean_temp(files.upload.path);
								}else {
									var msg = {
										status:"OK",
										msg:update_res
									}
									res.send(msg);
									clean_temp(files.upload.path);
								}
							});
		    			}
		    		}
		    	});
	    	}
	    });
	}
});

// a revoire

app.get('/delete/store/:uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		if(req.params.uuid!=undefined && req.params.uuid!=""){
			var query = 'delete stores from stores where uuid=? and users_uuid=?';
			mysqlConnection.query(query, [req.params.uuid, req.session.uuid], function(err, delete_res){
				if(err){
					var msg = {
						status:"ERR",
						msg:err
					};
					res.send(msg);
				}else {
					var msg = {
						status:"OK",
						msg:"store deleted with all it products"
					};
					res.send(msg);
				}
			});	
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid uuid"
			};
			res.send(msg);
		}
	}
});

app.get('/store/:uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		var query = 'select uuid, name, address, phone from stores where uuid=?';
		if(req.params.uuid!=undefined){
			mysqlConnection.query(query, [req.params.uuid], function(err, rows, fields){
				if(err){
					var msg = {
						status:"ERR",
						msg:"unable to select"
					};
					res.send(msg);
				}else {
					if(rows.length!=0){
						var msg = {
							status:"OK",
							msg:rows
						};
						res.send(msg);
					}else {
						var msg = {
							status:"OK",
							msg:"not found"
						};
						res.send(msg);
					}
				}
			});
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid uuid"
			};
			res.send(msg);
		}
	}
})


app.get('/stores', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		var query = 'select stores.uuid, stores.name, stores.address, stores.phone from stores where users_uuid=?';
		mysqlConnection.query(query, [req.session.uuid], function(err, rows, fields){
			if(err){
				var msg = {
					status:"ERR",
					msg:"unable to select stores"
				};
				res.send(msg);
			}else {
				var msg = {
					status:"OK",
					msg:rows
				};
				res.send(msg);
			}
		});
	}
});

// product logic

app.post('/product', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		var form = new formidable.IncomingForm();
				form.maxFieldsSize = 2 * 1024 * 1024;

				form.on('error', function(message){
					// or redirect
					var msg = {
						status:"ERR",
						msg:"unable to upload product"
					};
					res.send(msg);
				});

			    form.parse(req, function(err, fields, files) {
			    	if(err){
			    		// should change this by error uploading page (page)
			    		var msg = {
			    			status:"ERR",
			    			msg:err
			    		};
			    		res.send(msg);
			    	}else {
			    		//console.dir(fields);
			    		///delete/store/console.dir(files);
			    		validate_image(files.upload.type, function(err1){
			    			if(err1){
			    				var msg = {
			    					status:"ERR",
			    					msg:"image type invalid"
			    				};
			    				res.send(msg);
			    				clean_temp(files.upload.path);
			    			}else {
			    				fs.exists(files.upload.path, function(bool){
					    			if(bool){
					    				var name = '/tmp/'+files.upload.name+'-small';
					    				im.convert([files.upload.path, '-resize', '221x440', name], function(err, stdout){
	                                        if(err){
	                                       		clean_temp(name);
	                                        	clean_temp(files.upload.path);
	                                            var msg = {
	                                            	status:"ERR",
	                                            	msg:"make miniature error"
	                                            };
	                                            res.send(msg);
	                                        }else {
	                                        	fs.readFile(name, function(err, blob){
							    					if(err){
							    						var msg = {
							    							status:"ERR",
							    							msg:"unable to readFile"
							    						};
							    						res.send(msg);
							    						clean_temp(name);
							    						clean_temp(files.upload.path);
							    					}else {
							    						if(fields.name!="" && fields.price!="" && 
							    							fields.currency!="" && fields.number!="" && fields.store!=""){
							    							var query = 'insert into products (uuid, name, price, currency, image, type, size, number, created, updated, stores_uuid) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
															var uuid = node_uuid.v1();
															mysqlConnection.query(query, [uuid, fields.name, fields.price, fields.currency, blob, files.upload.type, files.upload.size, fields.number, new Date(), new Date(), fields.store], function(err, insert_res){
																if(err){
																	var msg = {
																		status:"ERR",
																		msg:err
																	};
																	res.send(msg);
																	clean_temp(name);
																	clean_temp(files.upload.path);
																}else {
																	/*
																	var msg = {
																		status:"OK",
																		msg:"inserted"
																	};
																	res.send(msg);
																	*/
																	res.redirect('/');
																	clean_temp(name);
																	clean_temp(files.upload.path);
																}
															});
							    						}else {
							    							var msg = {
							    								status:"ERR",
							    								msg:"invalid data"
							    							};
							    							res.send(msg);
							    							clean_temp(name);
															clean_temp(files.upload.path);
							    						}
							    					}
							    				});
											}
                                        });
					    			}else {
					    				var msg = {
					    					status:"ERR",
					    					msg:"unable to upload fs.exists"
					    				};
					    				res.send(msg);
					    			}
					    		});
			    			}
			    		});
			    	}
			    })
	}
});

app.get('/products', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		var query = 'select products.uuid, products.name, products.price, products.currency, products.type, products.size, products.number, products.created, products.updated from products inner join stores on products.stores_uuid=stores.uuid and stores.users_uuid=?';
		mysqlConnection.query(query, [req.session.uuid], function(err, rows, fields){
			if(err){
				var msg = {
					status:"ERR",
					msg:err
				};
				res.send(msg);
			}else {
				var msg = {
					status:"OK",
					msg:rows
				};
				res.send(msg);
			}
		});
	}
});

app.get('/products/:uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		if(req.params.uuid!=undefined && req.params.uuid!=""){
			var query = 'select products.uuid, products.name, products.price, products.currency, products.type, products.size, products.number, products.created, products.updated, stores.name as store_name from products inner join stores on products.stores_uuid=stores.uuid inner join users on stores.users_uuid=users.uuid where products.uuid=? and users.uuid=?'
			mysqlConnection.query(query, [req.params.uuid, req.session.uuid], function(err, rows, fields){
				if(err){
					var msg = {
						status:"ERR",
						msg:err
					};
					res.send(msg);
				}else {
					var msg = {
						status:"OK",
						msg:rows
					}
					res.send(msg);
				}
			});
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid uuid"
			};
			res.send(msg);
		}
	}
});

app.get('/products/stores/:uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		if(req.params.uuid!=undefined && req.params.uuid!=""){
			var query = 'select products.uuid, products.name, products.price, products.currency, products.type, products.size, products.number, products.created, products.updated, stores.name as store_name from products inner join stores on products.stores_uuid=stores.uuid inner join users on stores.users_uuid=users.uuid where stores.uuid=? and users.uuid=?'
			mysqlConnection.query(query, [req.params.uuid, req.session.uuid], function(err, rows, fields){
				if(err){
					var msg = {
						status:"ERR",
						msg:err
					};
					res.send(msg);
				}else {
					var msg = {
						status:"OK",
						msg:rows
					}
					res.send(msg);
				}
			});
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid uuid"
			};
			res.send(msg);
		}
	}
});

app.get('/update/products/:uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		if(req.params.uuid!=undefined && req.params.uuid!=""){
			res.sendFile(__dirname+'/templates/update_product.html');
		}
	}
});

app.get('/image/:uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		if(req.params.uuid!=undefined){
			var query = 'select image, type from products where uuid=?';
			mysqlConnection.query(query, [req.params.uuid], function(err, rows, fields){
				if(err){
					var msg = {
						status:"ERR",
						msg:"unable to select"
					};
					res.send(msg);
				}else {
					if(rows.length!=0){
						res.setHeader('Content-Type', rows[0].type);
						res.end(rows[0].image);
					}else {
						var msg = {
							status:"ERR",
							msg:"not found"
						};
						res.send(msg);
					}
				}
			});
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid uuid"
			};
			res.send(msg);
		}
	}
});

app.get('/delete/products/:uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		if(req.params.uuid!=undefined && req.params.uuid!=""){
			var query = 'delete products from products inner join stores on  products.stores_uuid=stores.uuid inner join users on stores.users_uuid=users.uuid and products.uuid=? and users.uuid=?';
			mysqlConnection.query(query, [req.params.uuid, req.session.uuid], function(err, delete_res){
				if(err){
					var msg = {
						status:"ERR",
						msg:"unable to delete"
					};
					res.send(msg);
				}else {
					var msg = {
						status:"OK",
						res:delete_res,
						msg:"product deleted"
					};
					res.send(msg);
				}
			});	
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid uuid"
			};
			res.send(msg);
		}
	}
});

// template 
app.get('/', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		res.sendFile(__dirname+'/templates/index.html');
	}
});

app.get('/settings', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		res.sendFile(__dirname+'/templates/settings.html');
	}
});

app.get('/excel/:store_uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		if(req.params.store_uuid!='' && req.params.store_uuid!=undefined){
			var xlsx = require('node-xlsx');
			var query = 'select products.uuid, products.name, products.price, products.currency, products.number, stores.name as store_name from products inner join stores on products.stores_uuid=stores.uuid inner join users on stores.users_uuid=users.uuid and users.uuid=? and stores.uuid=?';
			mysqlConnection.query(query, [req.session.uuid, req.params.store_uuid], function(err, rows, fields){
				if(err){
					var msg = {
						status:"ERR",
						msg:err
					};
					res.send(msg);
				}else {
					console.dir(rows);
					var data = [];
					for(var i=0;i<rows.length;i++){
						var instance = [];
						instance.push(rows[i].uuid);
						instance.push(rows[i].name);
						instance.push(rows[i].price);
						instance.push(rows[i].currency);
						instance.push(rows[i].number);
						instance.push(rows[i].store_name);
						data.push(instance);
					}			
					console.dir(buffer);
					var buffer = xlsx.build([{name: "mySheetName", data: data}]); // returns a buffer
					res.setHeader('Content-Type', 'application/x-ms-excel');
					res.end(buffer);
				}
			});
		}else{
			var msg = {
				status:"OK",
				msg:"invalid Data"
			};
			res.send(msg);
		}
	}
});

app.get('/csv/:store_uuid', function(req, res){
	if(!req.session.name){
		res.redirect('/login');
	}else {
		if(req.params.store_uuid!=undefined && req.params.store_uuid!=""){
			var query = 'select products.uuid, products.name, products.price, products.currency, products.number, stores.name as store_name from products inner join stores on products.stores_uuid=stores.uuid inner join users on stores.users_uuid=users.uuid and users.uuid=? and stores.uuid=?';
			mysqlConnection.query(query, [req.session.uuid, req.params.store_uuid], function(err, rows, fields){
				if(err){
					var msg = {
						status:"ERR",
						msg:err
					};
					res.send(msg);
				}else {
					var json2csv = require('json2csv');
					json2csv({data:rows,fields:['uuid', 'name', 'price', 'currency', 'number', 'store_name']}, function(err, csv) {
						if(err){
							var msg = {
								status:"ERR",
								msg:"unable to generate csv"
							};
							res.send(msg);
						}else {
							res.setHeader('Content-type', 'text/csv');
							res.end(csv);
						}
					});
				}
			});
		}else {
			var msg = {
				status:"ERR",
				msg:"invalid uuid"
			};
			res.send(msg);
		}
	}
});

app.listen(8081, '0.0.0.0');
loger.log("PROC["+process.pid+"] http://0.0.0.0:8081")