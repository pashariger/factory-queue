var Queue = require('./factory-queue.js');
var _ = require('underscore');
var Q = require('q');

/*
	Example:
	
	Let's pretend we wanted to aggregate data from an external API,
	transform that data into a format that our system understands,
	and store it in our database.
*/
var config = {
	total: 2, 		// number of items the mock API has
	fetchDelay: 500, 	// mock time it takes to make API call
	processDelay: 10, 	// mock time it takes to process and store data in our database
};

/* mock API call that feeds us results */
function callAPIforData(limit, offset, callback){
	var results = [];

	for (var i = 0 ; i < (config.total - offset) ; i++) {
		if (i >= limit) break;
		results.push({ _id: offset+i });
	};

	setTimeout(function(){
		callback({
			total: config.total,
			items: results
		});
	}, config.fetchDelay);
}

/* mock application call that deals with data */
function doSomethingWithData(data, callback){
	setTimeout(function(){
		callback();
	},config.processDelay);
}


// promise we pass to the Queue that resolves with { items: [{},{},{}...], total: Number }
function fetch(limit, offset, _fetchOptions){
	var deferred = Q.defer();
	
	callAPIforData(limit, offset, function(result){
		console.log('returned',result.items.length);
		deferred.resolve(result);
	})

	return deferred.promise;
}

// promise we pass to the queue that resolves when action is complete
function process(item){
	var deferred = Q.defer();
	
	doSomethingWithData(item, function(result){
		deferred.resolve(result);
	})

	return deferred.promise;
}

var fetchOptions = {
	limit: 50, 						// limit for API fetch paging
	offset: 0,						// offset for API fetch paging
	paged: false, 					// if true, then limit/offset treated as perPage/page
	total: false, 					// forced total, when this many objects are processed, queue resolves
	fetchTimeout: 0 				// forced timeout for fetch, can be used to throttle API calls
}

var queueOptions = {
	requestLimit: 1,  				// make this many fetch requests at the same time
	processingLimit: 1, 			// make this many process requests at the same time
	queueLimit: 5000,				// throttles request rate when queue has this many items
	maxRuntimeSeconds: 3600 		// throws error when past timeout
}

// lets do it
Queue.fetchAndProcess(fetch, process, fetchOptions, queueOptions).then(function(result){
	console.log('done!',result);
},function(err){
	console.log('error',err);
},function(message){
	//console.log('notification',message);
});




return;
/*
	Alternative style of calling the queue as a block
*/

// fetch function (how you want to get data)
Queue.fetchAndProcess(function(limit, offset, _fetchOptions){
	var deferred = Q.defer();
	
	callAPIforData(limit, offset, function(result){
		deferred.resolve(result);
	})

	return deferred.promise;

//process function (what you do with the data)
},function(item){
	var deferred = Q.defer();
	
	doSomethingWithData(item, function(result){
		deferred.resolve(result);
	})

	return deferred.promise;

// fetch options (for dealing with your data source)
},{
	limit: 50, 		
	offset: 0,		
	paged: false, 	
	total: false, 	
	fetchTimeout: 0 

// queue options (for dealing with concurrency, queue size and timeouts)
},{
	requestLimit: 1,  		
	processingLimit: 1, 	
	queueLimit: 500,		
	maxRuntimeSeconds: 3600 

// result handlers
}).then(function(result){
	console.log('done!',result);
},function(err){
	console.log('error',err);
},function(message){
	console.log('notification',message);
});