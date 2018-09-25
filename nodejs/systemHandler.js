/**
 * Copyright 2018 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const logger = require('f5-logger').getInstance(); // eslint-disable-line import/no-unresolved

class SystemHandler {
    constructor(declaration, bigIp) {
        this.declaration = declaration || {};
        this.bigIp = bigIp;
    }

    process() {
        let promise;

        logger.info('Processing system declaration');

        if (this.declaration.ntp) {
            promise = this.bigIp.modify(
                '/tm/sys/ntp',
                {
                    servers: this.declaration.ntp.servers,
                    timezone: this.declaration.ntp.timezone
                }
            );
        } else {
            promise = Promise.resolve();
        }

        return promise
            .then(() => {
                if (this.declaration.dns) {
                    return this.bigIp.modify(
                        '/tm/sys/dns',
                        {
                            'name-servers': this.declaration.dns.nameServers,
                            search: this.declaration.dns.search
                        }
                    );
                }
                return Promise.resolve();
            })
            .then(() => {
                if (this.declaration.hostname) {
                    return this.bigIp.onboard.hostname(this.declaration.hostname);
                }
                return Promise.resolve();
            })
            .then(() => {
                if (this.declaration.users) {
                    const users = Object.keys(this.declaration.users);
                    const promises = [];
                    users.forEach((user) => {
                        if (user === 'root') {
                            promises.push(this.bigIp.onboard.password(
                                'root',
                                this.declaration.users.root.newPassword,
                                this.declaration.users.root.oldPassword
                            ));
                        } else {
                            promises.push(this.bigIp.onboard.updateUser(
                                user,
                                this.declaration.users[user].password,
                                this.declaration.users[user].role,
                                this.declaration.users[user].shell
                            ));
                        }
                    });

                    return Promise.all(promises);
                }
                return Promise.resolve();
            })
            .then(() => {
                if (this.declaration.license) {
                    if (this.declaration.license.regKey || this.declaration.license.addOnKeys) {
                        return this.bigIp.onboard.license(
                            {
                                registrationKey: this.declaration.license.regKey,
                                addOnKeys: this.declaration.license.addOnKeys,
                                overwrite: this.declaration.license.overwrite
                            }
                        );
                    }
                }
                return Promise.resolve();
            })
            .catch((err) => {
                logger.severe(`Error processing system declaration: ${err.message}`);
                return Promise.reject(err);
            });
    }
}

module.exports = SystemHandler;