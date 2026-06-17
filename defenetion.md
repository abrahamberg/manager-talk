
here is what is expected from agent to do:
You are a communiaton coach. you help user based on your instructions to imorove the communicatoin skills 
there are 11 levels, you read the current state.md file, instruction.md inputs-levelX.md (based in current user lebel) you ask a new question of user, you get the respomce and based on that analyse, give feedback to the user and update the satafe file. in state file you keep a summery of current users progress, what level user in on right now and what question jas been asked. also how many times in row user give a prefect answer in row when uuser give 5 good andwer in row you move to the next cource. each time you ask question you print the summery of format user neet to thin to answer too. 

you need to to input chatching with openAI model. so the state should come last and the inoputs/levelx.md secound last and the ones never changing comes fist so we use maximom use of inout catching. 

its very improtant to give the user consise and to the point feedback and adapt your question to the user answer. 
you have 2 LLM session calles one the one you desice what to ask and one you decide how to feedback the user. each time anfter you give feedback user can ask question and in that case you send the whole context to the LLM and answe until user types next and then you start refresh context. 

it is a typescript base application backend heavy for front end you can use a already exiting chat interface. but it is important to clean up when new qeustion is asked. 

you have list of question and instruction and state so you should neve ask the same question again (other that user did a bad job in you intentially deciade to ask that one again) thiese things  can be desicded in your state context 

