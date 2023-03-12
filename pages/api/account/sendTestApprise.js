//Lib
import { authOptions } from '../auth/[...nextauth]';
import { unstable_getServerSession } from 'next-auth/next';
import { promises as fs } from 'fs';
import path from 'path';
const { exec } = require('child_process');

export default async function handler(req, res) {
    if (req.method == 'POST') {
        //Verify that the user is logged in.
        const session = await unstable_getServerSession(req, res, authOptions);
        if (!session) {
            res.status(401).json({ message: 'You must be logged in.' });
            return;
        }

        //The data we expect to receive
        let { sendTestApprise } = req.body;

        //Read the users file
        //Find the absolute path of the json directory
        const jsonDirectory = path.join(process.cwd(), '/config');
        let usersList = await fs.readFile(
            jsonDirectory + '/users.json',
            'utf8'
        );
        //Parse the usersList
        usersList = JSON.parse(usersList);

        //1 : Verify that the user of the session exists
        const userIndex = usersList
            .map((user) => user.username)
            .indexOf(session.user.name);
        if (userIndex === -1) {
            res.status(400).json({
                message:
                    'User is incorrect. Please, logout to update your session.',
            });
            return;
        }

        //2 : control the data
        if (!sendTestApprise) {
            res.status(422).json({ message: 'Unexpected data' });
            return;
        }

        ////3 : Send the notification to services
        //Build the URLs service list as a single string
        let appriseServicesURLs = '';
        for (let service of usersList[userIndex].appriseServices) {
            appriseServicesURLs = appriseServicesURLs + service + ' ';
        }
        //Mode : package
        if (usersList[userIndex].appriseMode === 'package') {
            try {
                //Check if apprise is installed as local package.
                exec('apprise -V', (error, stderr, stdout) => {
                    if (error) {
                        console.log(
                            `Error when checking if Apprise is a local package : ${error}`
                        );
                        res.status(500).json({
                            message:
                                'Apprise is not installed as local package on your server.',
                        });
                        return;
                    } else {
                        //Send notification via local package.
                        exec(
                            `apprise -v -b "This is a test notification from BorgWarehouse !" ${appriseServicesURLs}`,
                            (error, stderr, stdout) => {
                                if (stderr) {
                                    res.status(500).json({
                                        message:
                                            'There are some errors : ' + stderr,
                                    });
                                    return;
                                } else {
                                    res.status(200).json({
                                        message:
                                            'Notifications successfully sent.',
                                    });
                                    return;
                                }
                            }
                        );
                    }
                });
            } catch (err) {
                console.log(err);
                res.status(500).json({
                    message:
                        'Error on sending notification. Contact your administrator.',
                });
                return;
            }

            //Mode : stateless
        } else if (usersList[userIndex].appriseMode === 'stateless') {
            //If stateless URL is empty
            if (usersList[userIndex].appriseStatelessURL === '') {
                res.status(500).json({
                    message: 'Please, provide an Apprise stateless API URL.',
                });
                return;
            }
            try {
                await fetch(
                    usersList[userIndex].appriseStatelessURL + '/notify',
                    {
                        method: 'POST',
                        headers: {
                            'Content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            urls: appriseServicesURLs,
                            body: 'This is a test notification from BorgWarehouse !',
                        }),
                    }
                ).then((response) => {
                    console.log(response);
                    if (response.ok) {
                        res.status(200).json({
                            message: 'Notifications successfully sent.',
                        });
                        return;
                    } else {
                        console.log(response);
                        res.status(500).json({
                            message:
                                'There are some errors : ' +
                                response.statusText,
                        });
                        return;
                    }
                });
            } catch (err) {
                res.status(500).json({
                    message: 'Error : ' + err.message,
                });
                return;
            }

            //Mode : unknown
        } else {
            res.status(422).json({
                message: 'No Apprise Mode selected or supported.',
            });
        }
    }
}
