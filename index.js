//Entry point jargon needed to import our constants we will need.
const alexaSDK = require('alexa-sdk');
const awsSDK = require('aws-sdk');
const promisify = require('es6-promisify');

const appId = 'amzn1.ask.skill.6e8ba32f-2408-4ff7-9b35-e90bae093a3a';
const remindersTable = 'Reminders';
const docClient = new awsSDK.DynamoDB.DocumentClient();

// convert callback style functions to promises
const dbScan = promisify(docClient.scan, docClient);
const dbGet = promisify(docClient.get, docClient);
const dbPut = promisify(docClient.put, docClient);
const dbDelete = promisify(docClient.delete, docClient);

//instructions when we invoke the app
const instructions =    `Welcome to Foggy Mind<break strength="medium" /> 
                        The following commands are available: Get reminder by type,
                        add a reminder or remove a reminder. You can also register your email within the app
                        What would you like to do?`;

const handlers = {
                    

    //When the skill is invocated it will begin with our 
    //initial instructions explaining what the user can do
    'LaunchRequest'() {
        this.emit(':ask', instructions, instructions, 'Link your account', 'Please link your account if you wish to use email functionality');

    },

    'AddRemindersIntent'() {
        //
        const {userId} = this.event.session.user;
        const {slots} = this.event.request.intent;

        //if we don't have the value of the reminder yet, get it
        if(!slots.ReminderName.value) {
            const slotToElicit = 'ReminderName';
            const speechOutput = 'What is your reminder?';
            const repromptSpeech = 'Please tell me the reminder you would like to add';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        }


        else if (slots.ReminderName.confirmationStatus !== 'CONFIRMED') {
        //slot status is uncomfirmed and we need to comfirm it. NOT DENIED. different.
            if (slots.ReminderName.confirmationStatus !== 'DENIED') {
                const slotToConfirm = 'ReminderName';
                const speechOutput = `The name of the reminder is ${slots.ReminderName.value}, correct?`;
                const repromptSpeech = speechOutput;
                return this.emit(':confirmSlot', slotToConfirm, speechOutput, repromptSpeech);
            }
            // the slot was denied and we need a reprompt for the data
            const slotToElicit = 'ReminderName';
            const speechOutput = 'What is your reminder?';
            const repromptSpeech = 'Please tell me the reminder you would like to add';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        }
        // ask for the type of reminder
        if (!slots.ReminderType.value) {
            const slotToElicit = 'ReminderType';
            const speechOutput = 'What type of reminder is this?';
            const repromptSpeech = 'What type of reminder is this?';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        }
        //again, confirm the slot type ready for entry 
        else if (slots.ReminderType.confirmationStatus !== 'CONFIRMED') {

            if (slots.ReminderType.confirmationStatus !== 'DENIED') {
                // slot status: unconfirmed
                const slotToConfirm = 'ReminderType';
                const speechOutput = `This is a ${slots.ReminderType.value} reminder, correct?`;
                const repromptSpeech = speechOutput;
                return this.emit(':confirmSlot', slotToConfirm, speechOutput, repromptSpeech);
            }

                const slotToElicit = 'ReminderType';
                const speechOutput = 'What type of reminder is this?';
                const repromptSpeech = 'What type of reminder is this?';
                return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        }

        

        //now we add the data to the database 
        //set up our database with variables
        const name = slots.ReminderName.value;
        const reminderType = slots.ReminderType.value;
        const dynamoParams = {
            TableName: remindersTable,
            Item: {
                Name: name,
                UserId: userId,
                ReminderType: reminderType
            }
        };
        //check if table exists on AWS
        const checkIfReminderExistsParams = {
            TableName: remindersTable,
            Key: {
                Name: name,
                UserId: userId
            }  
        };
        //if it does exist then
        dbGet(checkIfReminderExistsParams).then(data => {
            //logging our outputs to cloud for testing purposes
            console.log('Get reminder succeeded', data);

            const reminder = data.Item;
            //if reminder true, must already exist 
            if(reminder) {
                const errorMsg = `Reminder ${name} already exists!`;
                this.emit(':tell', errorMsg);
                throw new Error(errorMsg);
            }
            //else put it in our database, append item
            else {
                return dbPut(dynamoParams);
            }
        })
        //suceeded, tell user
        .then(data=> {
            console.log('Add reminder succeeded', data);

            this.emit(':tell', `Reminder ${name} added`);
        })
        //else tell user error 
        .catch(err => {
            console.error(err);
        });
    },

    'LeavingIntent'() {
        const { userId } = this.event.session.user;
        const { slots } = this.event.request.intent;

        let output;
        let cardOutput

        if (!slots.ReminderType.value) {
            const slotToElicit = 'ReminderType';
            const speechOutput = 'Which reminders would you like before you leave?';
            const repromptSpeech = 'Which reminders would you like before you leave?';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        }

        const reminderType = slots.ReminderType.value;

        const dynamoParams = {
            TableName: remindersTable
        };
        // if we have the reminder type then we can begin to query database
        if (reminderType) {
            //filter database to fit only our reminder type
            dynamoParams.FilterExpression = 'UserId = :user_id AND ReminderType = :reminderType';
            //use this function to replace :reminderType token with reminderType string instead at run time
            dynamoParams.ExpressionAttributeValues = { ':user_id': userId, ':reminderType': reminderType };
            //prepare our output for being appended to
            output = `Don't forget to take your ${slots.ReminderType.value} reminders: <break strength="x-strong" />`;
            cardOutput = `Don't forget to take your ${slots.ReminderType.value} reminders: `;
        }
        //if we found the table then scan all items in table 
        dbScan(dynamoParams)
            .then(data => {
                console.log('Read table succeeded!', data);
                //if items exist based on our filtering then append these items to output
                if (data.Items && data.Items.length) {
                    data.Items.forEach(item => {
                        output += `${item.Name}<break strength="x-strong" /> `; cardOutput += `${item.Name}, `});
                }
                //else return no reminders
                else {
                    output = 'No reminders found!';
                    cardOutput = 'No reminders found!';
                }

                console.log('output', output);

                this.emit(':tellWithCard', output, `Leaving for ${slots.ReminderType.value} :`, cardOutput);
            })
            .catch(err => {
                console.error(err);
            });
        

        
    },
    //intent to return a list of reminders based on their type
    'GetRemindersIntent'(){
    try{
        const {userId} = this.event.session.user;
        const {slots} = this.event.request.intent;

        //an output for us to append to with new items
        let output;
        let cardOutput;
        //if we don't have value then get the type of reminder we request
        //no need to confirm slot as we're changing database in any way
        if (!slots.ReminderType.value) {
            const slotToElicit = 'ReminderType';
            const speechOutput = 'What type of reminders do you require?';
            const repromptSpeech = 'What type of reminders do you require?';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        }
        //constant for our table to check against
        const reminderType = slots.ReminderType.value;

        const dynamoParams = {
            TableName: remindersTable
        };
        // if we have the reminder type then we can begin to query database
        if (reminderType) {
            //filter database to fit only our reminder type
            dynamoParams.FilterExpression = 'UserId = :user_id AND ReminderType = :reminderType';
            //use this function to replace :reminderType token with reminderType string instead at run time
            dynamoParams.ExpressionAttributeValues = { ':user_id': userId, ':reminderType': reminderType };
            //prepare our output for being appended to
            output = `The following ${slots.ReminderType.value} reminders were found: <break strength="x-strong" />`;
            cardOutput = `The following ${slots.ReminderType.value} reminders were found: `;
        }
          //if we found the table then  
          dbScan(dynamoParams)
          .then(data => {
            console.log('Read table succeeded!', data);
            //if items exist based on our filtering then append these items to output
            if (data.Items && data.Items.length) {
                data.Items.forEach(item => {
                    output += `${item.Name}<break strength="x-strong" /> `; cardOutput += `${item.Name}, `});
            }
            //else return no reminders
            else {
                output = 'No reminders found!';
                cardOutput = 'No reminders found!';
            }
    
            console.log('output', output);
    
            this.emit(':tellWithCard', output, `Your ${slots.ReminderType.value} reminders: `, cardOutput);
          })
          .catch(err => {
            console.error(err);
          });
        }
    catch (error) {
        context.fail(`Exception: ${error}`)}

        
    },
    //intent to remove individual reminders from our database 
    'RemoveRemindersIntent'(){
          const {slots} = this.event.request.intent;
          //if we don't have name of the reminder to delete, get it
          if (!slots.ReminderName.value) {
            const slotToElicit = 'ReminderName';
            const speechOutput = 'What is the name of the reminder you would like to delete?';
            const repromptSpeech = 'Please tell me the name of the reminder';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
          }
          //confirm the name since we're changing the database 
          else if (slots.ReminderName.confirmationStatus!= 'CONFIRMED'){
              
              if (slots.ReminderName.confirmationStatus!= 'DENIED'){
                const slotToConfirm = 'ReminderName';
                const speechOutput = `You would like to delete the reminder ${slots.ReminderName.value}, correct?`;
                const repromptSpeech = speechOutput;
                return this.emit(':confirmSlot', slotToConfirm, speechOutput, repromptSpeech);
            }
            //denied, repeat for info
            const slotToElicit = 'ReminderName';
            const speechOutput = 'What is the name of the reminder you would like to delete?';
            const repromptSpeech = 'Please tell me the name of the reminder';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
          }
          //set up our database params
          const { userId } = this.event.session.user;
          const reminders = slots.ReminderName.value;
          const dynamoParams = {
            TableName: remindersTable,
            Key: {
              Name: reminders,
              UserId: userId
            }
          };
        

          console.log('Attempting to read data');
          //if we get our database correctly then
          dbGet(dynamoParams)
          .then(data => {
            console.log('Get item succeeded', data);
    
            const reminder = data.Item;
            //if we found the reminder we want to delete then attempt to delete it
            if (reminder) {
              console.log('Attempting to delete data', data);
    
              return dbDelete(dynamoParams);
            }

            const errorMsg = `Reminder ${reminders} not found!`;
            this.emit(':tell', errorMsg);
            throw new Error(errorMsg);
        })
        .then(data=> {
            console.log('Delete item succeeded', data);
            //suceeded, deleted the item let user know
            this.emit(':tell', `Reminder ${reminders} deleted!`);
        })
        .catch(err=> console.log(err));
    },
      //basic helper handlers
      'AMAZON.HelpIntent'() {
        var speechOutput = "Why not try adding a reminder if this is your first time using the skill?";
        var reprompt = "Please go to the skill page to find more help!";
        this.emit(":ask", speechOutput, reprompt);
      },
    
      'AMAZON.StopIntent'() {
        this.emit(":tell", "Goodbye!");
      },
      'AMAZON.CancelIntent'(){
        this.emit(":tell", "Goodbye!");
      }

      


};

//More entry point things, used to export our handlers and execute our alexa app 
exports.handler = function handler(event, context) {
    const alexa = alexaSDK.handler(event, context);
    alexa.appId = appId;
    alexa.registerHandlers(handlers);
    alexa.execute();
  };



                

