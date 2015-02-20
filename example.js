var FactoryQueue = require('./factory-queue.js');
var Q = require('q');

/*
	Note: read more documentation in factory-queue.js
*/

/*
	Example:
	
	Let's pretend we wanted to aggregate data from an external API,
	transform that data into a format that our system understands,
	and store it in our database. 

	Steps:
	1. Write a function that fetches data from any source (your application logic) 
		- ex: DB,API,Array,FileStream
	2. Write a function that handles a single element that you need to process (your application logic)
		- ex: modify element and store in database
		- ex: run another factory queue to perform a nested set of operations
	3. Optionally set concurrency and throttling options
		- ex: "process" elements faster (higher number at the same time) than you "fetch" them from an API
		- ex: throttle API fetches to avoid being banned by the API provider
		- ex: control pagination limits/offsets or set a hard max of elements to retrieve
		- ex: set a queue size to avoid high memory usage
	4. Profit
		- ex: didn't have to write loops, setTimeouts, recursive algorithms, promises to control flow
		- ex: didn't have to worry about edge cases for grabbing data from APIs
		- ex: didn't hit memory limits by first reading all the data I need
		- ex: made a nice cup of coffee and watched the progress

	This example logs the progress notification part of the promise:

		notification { offset: 800, queueSize: 5, processed: 760 }
		notification { offset: 800, queueSize: 4, processed: 760 }
		notification { offset: 800, queueSize: 3, processed: 762 }
		notification { offset: 800, queueSize: 2, processed: 762 }
		notification { offset: 800, queueSize: 1, processed: 764 }
		notification { offset: 800, queueSize: 0, processed: 765 }
		done! { status: 'done', fetched: 765, processed: 765, time: 16.745 }

	What you see here is the last couple of lines of the factory queue finishing its task.
		offset 		- stands for the last offset fetched from the API
		queueSize 	- the number of elements left to process
		processed 	- total number of elements that successfully processed
		time 		- at the end we can see how long the job took
*/
var config = {
	total: 765, 		// number of items the mock API has
	fetchDelay: 300, 	// mock time it takes to make API call
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
	limit: 50, 						// limit for API fetch pagination
	offset: 0,						// offset for API fetch pagination
	paged: false, 					// if true, then limit/offset treated as perPage/page
	total: false, 					// forced total, when this many objects are processed, queue resolves
	fetchTimeout: 0 				// forced timeout for fetch, can be used to throttle API calls
}

var queueOptions = {
	requestLimit: 1,  				// make this many fetch requests at the same time
	processingLimit: 2, 			// make this many process requests at the same time
	queueLimit: 150,				// throttles request rate when queue has this many items
	maxRuntimeSeconds: 3600 		// throws error when past timeout
}

// lets do it
FactoryQueue.fetchAndProcess(fetch, process, fetchOptions, queueOptions).then(function(result){
	// when all elements have been fetched and processed
	console.log('done!',result);
},function(err){
	// when an error occurred during one of the tasks
	console.log('error!',err);
},function(message){
	// returns progress object after every processed element
	// you can use this to save the progress in a cache or database so you can pick up where you left off
	console.log('notification:',message);
});


return;
/*
	Alternative style of calling the queue as a block
*/

// fetch function (how you want to get data)
FactoryQueue.fetchAndProcess(function(limit, offset, _fetchOptions){
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