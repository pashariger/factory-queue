var _ = require('underscore');
var Q = require('q');

/*
	Intro: This is a queue implementation where items are fetched from a source and then processed via some action.

	-Fetch and process functions are passed. 
	-The queue keeps track of and increments the offset parameter until the total number of items is fetched.
	-Process function pops items from the queue and exectues an action for each item.

	Concurrency: Via options, the concurrency level is defined for fetches and processes, allowing to perform both calls in parallel.

	@param fetchFunc - returns an array of items from a source
		@param limit - limit of items to fetch 
		@param offset - current offset
		@_fetchOptions - (see below)

	@param processFunc - given an item performs an operation on it and returns status
		@param item - item to be processed
	
	@param fetchOptions - options for fetches. This object is passed into the caller's fetch function
		limit - sets limit of items to grab by fetch function
		maxLimit - sets max number of items to fetch. Breaks queue when maxLimit items have been processed.
		offset - starting with 0, this offset is increased by @limit, after every fetch
		total - set by caller, when total is reached fetches stop
		paged - when set to true, offset is incremented by 1 instead of limit
		fetchTimeout (milliseconds) - forces fetch function to wait before returning results. Can be used to throttle requests
	
	@param queueOptions 
		requestLimit - number of concurrent fetches to run
		processingLimit - number of concurrent process actions to run
		queueLimit - when queue has more than this number of items, the fetch requests are throttled
		maxRuntimeSeconds - after this limit, the whole process is killed and returns an error
		processTimeout (milliseconds) - forces the process function to wait before returning result. Can be used to throttle requests
		processed - total number of items processed during execution
*/

exports.fetchAndProcess = function fetchAndProcess(fetchFunc,processFunc,fetchOptions,queueOptions){
	/* options */
	var _fetchOptions = {
		limit: 50,
		offset: 0,
		maxLimit: false,
		paged: false,
		total: false,
		fetchTimeout: 0
	}
	
	var _queueOptions = {
		requestLimit: 1,
		processingLimit: 1,
		queueLimit: 1000,
		maxRuntimeSeconds: 15000,
		processTimeout: 0,
		processed: 0
	}

	/* queue & concurrency */
	var _queue = [];
	var _timeStart = Date.now();
	var _timeEnd = false;
	var _requestsConcurrent = 0;
	var _processingConcurrent = 0;
	var _err = false;

	/* external functions passed */
	var _fetchFunc = false;
	var _processFunc = false;

	_requestsConcurrent = 0;
	_processingConcurrent = 0;
	_err = false;
	_fetchFunc = fetchFunc;
	_processFunc = processFunc;

	/* extend with user options */
	if(fetchOptions) _fetchOptions = _.extend(_fetchOptions, fetchOptions);
	if(queueOptions) _queueOptions = _.extend(_queueOptions, queueOptions);

	/* if fetch passes an array instead of get method */
	if(_.isArray(_fetchFunc)){
		_fetchOptions.total = _fetchFunc.length;
	}

	var deferred = Q.defer(); 

	/* completion check */
	var completeCheck = setInterval(function(){
		/* in case we processed all */
		if(_err){
			/* error occurred */
			clearInterval(completeCheck);
			
			console.error("Error in Queue",{ error: _err, meta: { fetched: _fetchOptions.total, processed: _queueOptions.processed, time: ((Date.now() - _timeStart)/1000.0) } });

			deferred.reject({ error: _err, meta: { fetched: _fetchOptions.total, processed: _queueOptions.processed, time: ((Date.now() - _timeStart)/1000.0) } });
		}else if(_timeEnd){
			clearInterval(completeCheck);
			deferred.resolve({ status: "done", fetched: _fetchOptions.total, processed: _queueOptions.processed, time: ((_timeEnd - _timeStart)/1000.0) });
		}else if((Date.now() - _timeStart)  > (_queueOptions.maxRuntimeSeconds * 1000)){
			/* maxRuntime reached */
			clearInterval(completeCheck);
			deferred.reject({ type: "timeout", message: "maxRuntime reached."});
		}
	},1000);


	function tryFetch(){
		if(_fetchOptions.total && _queueOptions.processed == _fetchOptions.total) return _timeEnd = Date.now();

		if(_err) return;
		if(_requestsConcurrent >= _queueOptions.requestLimit) return;
		if(_queue.length + (_fetchOptions.limit * (_requestsConcurrent+1)) >=_queueOptions.queueLimit) return;
		if(_fetchOptions.total && _fetchOptions.offset >= (_fetchOptions.paged ? _fetchOptions.total + 1 : _fetchOptions.total)) return;

		if(_fetchOptions.maxLimit && _fetchOptions.offset >= _fetchOptions.maxLimit) return;

		_requestsConcurrent++;
		fetch(_fetchOptions.limit,_fetchOptions.offset).then(function(items){
			_requestsConcurrent--;

			//console.log('finished fetching at offset '+_fetchOptions.offset+" added "+items.length+" items");

			if(!_.isEmpty(items)) _queue = _queue.concat(items);

			tryProcess();
			tryFetch();
		},function(err){
			_err = err;
		}).fail(function(err){
			_err = err;
		}).done();

		_fetchOptions.offset += (_fetchOptions.paged ? 1 : _fetchOptions.limit);
		tryFetch();
	}

	function tryProcess(){
		if(_fetchOptions.total && _queueOptions.processed == _fetchOptions.total) return _timeEnd = Date.now();

		if(_err) return;
		if(_.isEmpty(_queue)) return;
		if(_processingConcurrent >= _queueOptions.processingLimit) return;

		_processingConcurrent++;
		process(_queue.shift()).then(function(){
			_processingConcurrent--;
			deferred.notify({ offset: _fetchOptions.offset, queueSize: _queue.length, processed: _queueOptions.processed }); /* notify caller about total number of items processed */
			tryProcess();

			if(_.isFunction(_fetchFunc) && (_requestsConcurrent < _queueOptions.requestLimit) && (_fetchOptions.total && _fetchOptions.offset < (_fetchOptions.paged ? _fetchOptions.total + 1 : _fetchOptions.total))) tryFetch();
		},function(err){
			_err = err;
		}).fail(function(err){
			_err = err;
		}).done();

		tryProcess();
	}

	function fetch(limit, offset){
		var deferred = Q.defer();
		
		_fetchFunc(limit,offset,_fetchOptions).then(function(resp){
			if(!_fetchOptions.total && _fetchOptions.maxLimit && resp.total > _fetchOptions.maxLimit) _fetchOptions.total = _fetchOptions.maxLimit; /* set total based maxLimit if its greater than response total */
			if(!_fetchOptions.total && resp.total == 0) return deferred.reject({ error: "Source is empty."});
			if(!_fetchOptions.total) _fetchOptions.total = resp.total; /* set total based on response total */
			// if(_.isEmpty(resp.items)) _fetchOptions.total = _fetchOptions.offset;
			if(_fetchOptions.total != resp.total) _fetchOptions.total = resp.total;

			
			
			//if(_fetchOptions.maxLimit && _fetchOptions.maxLimit < resp.total) _fetchOptions.total = _fetchOptions.maxLimit;


			if(!_fetchOptions.fetchTimeout) return deferred.resolve(resp.items);
			setTimeout(function(){ deferred.resolve(resp.items); },_fetchOptions.fetchTimeout); /* delay return if timeout set */
		},function(err){
			_err = err;
		}).fail(function(err){
			_err = err;
		}).done();

		return deferred.promise;
	}

	function process(item){
		var deferred = Q.defer();
		_processFunc(item).then(function(resp){
			_queueOptions.processed++; /* increase total fetched counter */

			//console.log('processed count '+_queueOptions.processed);
			//console.log('queue length '+_queue.length);

			if(!_fetchOptions.paged && _fetchOptions.total == _queueOptions.processed) _timeEnd = Date.now(); /* processed all */
			if(_fetchOptions.paged && _fetchOptions.total * _fetchOptions.limit == _queueOptions.processed) _timeEnd = Date.now(); /* processed all */
			if(_fetchOptions.maxLimit && _queueOptions.processed == _fetchOptions.maxLimit) _timeEnd = Date.now(); /* processed all */

			if(_queueOptions.processed > _fetchOptions.total)

			if(!_queueOptions.processTimeout) return deferred.resolve();
			setTimeout(function(){ deferred.resolve(); },_queueOptions.processTimeout); /* delay return if timeout set */
		},function(err){
			_err = err;
		}).fail(function(err){
			_err = err;
		}).done();

		return deferred.promise;
	}

	if(_.isArray(_fetchFunc)){
		if(_.isEmpty(_fetchFunc)){
			deferred.resolve(); /* if we were to process an empty array, resolve and do nothing */
			clearInterval(completeCheck);
		}else{
			_queue = _fetchFunc;
			tryProcess(); /* start processing if process function is the queue. */
		}
	}else{
		tryFetch(fetchFunc); /* start */
	}		

	return deferred.promise;
}

return exports;