import * as Flex from '@twilio/flex-ui';
import React from 'react';

export const componentName = 'MainHeader';
export const componentHook = function addUploadLogsButton(flex: typeof Flex) {
  flex.MainHeader.Content.add(
    <Flex.IconButton
      icon="Folder"
      key="upload-logs-button"
      onClick={() => {
        Flex.Actions.invokeAction('CollectAndEmailLogs');
      }}
      title="Collect & Email Logs"
    />,
    {
      sortOrder: -1,
      align: 'end',
    },
  );
};
