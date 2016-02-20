# factory-queue

### A cautionary tale
Before I discovered async... I used this. So young. So foolish.

### Bored? Read on:

Useful queue implementation that helps you fetch and process data. Implemented using deferreds (q).

`YOU:` I need to grab 100s of pages of objects from an API, convert to my data format and store in my DB.

`FQ:` No problem. Just show me how to grab one page of data, and how to convert and store one element. I'll handle the rest.

`YOU:` Cool. I also need to read an 800MB csv, transform the data into objects, and store them in my DB.

`FQ:` Sure. Just create a file stream and show me how to read a line. I will make sure that I only keep N lines read at any given time, so you don't hit memory limits, or have to loop through an array of size 500,000.

`YOU:` I need to run an expensive operation for every user in my system.

`FQ:` Show me how to read users, define the operation, and I'll let you know when its done.

`YOU:` I don't need to fetch any data, but I do need to store this array of 200 objects into a DB.

`FQ:` Just give it to me and tell me how fast you want to write them.

`YOU:` I need to fetch all my users, then I need to fetch each user's transactions, update each transaction object with some new attributes, and store it back to the DB.

`FQ:` Yo Dawg, I heard you like factory queues...

#### FIRST RELEASE WARNING
There will be bugs.

#### HOW TO RUN
	npm install
	node example.js

#### TODO
* Documentation
* Tests
* Examples

Please see example.js for more info.

