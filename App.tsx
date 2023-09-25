/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useState} from 'react';

import {
  Button,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  Switch,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { StorageKeys } from './src/libs/localStorage/storage'

import {Colors} from 'react-native/Libraries/NewAppScreen';

import {
  uploadData,
  getOrCreateId,
  clearAllCozyGPSMemoryData,
  updateId,
  getAllLogs,
  sendLogFile,
  startTracking,
  stopTracking,
} from './geolocation/services';

const devMode = true;

function GeolocationSwitch() {
  const [enabled, setEnabled] = React.useState(false);
  const Toggle = () => {
    if (!enabled) {
      AsyncStorage.setItem(StorageKeys.ShouldBeTrackingFlagStorageAdress, 'true');
      startTracking();
    } else {
      AsyncStorage.setItem(StorageKeys.ShouldBeTrackingFlagStorageAdress, 'false');
      stopTracking();
    }
    setEnabled(previousState => !previousState);
  };

  React.useEffect(() => {
    const checkAsync = async () => {
      const value = await AsyncStorage.getItem(
        StorageKeys.ShouldBeTrackingFlagStorageAdress,
      );
      if (value !== undefined && value !== null) {
        if (value == 'true') {
          setEnabled(true);
          startTracking();
        } else {
          setEnabled(false);
          stopTracking();
        }
      } else {
        setEnabled(false);
        stopTracking();
        AsyncStorage.setItem(StorageKeys.ShouldBeTrackingFlagStorageAdress, 'false');
      }
    };
    checkAsync();
  }, []);

  return (
    <View style={{alignItems: 'center', padding: 50}}>
      <Text
        style={{
          fontSize: 36,
          padding: 10,
          color: useColorScheme() === 'dark' ? '#ffffff' : '#000000',
        }}>
        Tracking
      </Text>
      <Switch value={enabled} onValueChange={Toggle} />
    </View>
  );
}

function App(): JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  const [PopUpVisible, setPopUpVisible] = useState(false);
  const [idInputPopupVisible, setIdInputPopupVisible] = useState(false);
  const DisplayIdInputPopup = async () => {
    setIdBoxTest((await getOrCreateId()) || '');
    setIdInputPopupVisible(true);
  };
  const ForceUploadMobility = async () => {
    if (await uploadData(true)) {
      MakePopup('✅ All mobility measures uploaded!');
    } else {
      MakePopup('❌ There are still local positions');
    }
  };

  const closeModal = () => {
    setPopUpVisible(false);
  };

  const closeIdInputPopup = () => {
    setIdInputPopupVisible(false);
  };

  const [IdBoxText, setIdBoxTest] = useState('');

  const [popUpText, setPopUpText] = useState('No message');
  const PopUp = () => {
    return (
      <Modal
        visible={PopUpVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closeModal}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalText}>{popUpText}</Text>
            <Button title="Close" onPress={closeModal} />
          </View>
        </View>
      </Modal>
    );
  };

  function MakePopup(text: string) {
    setPopUpText(text);
    setPopUpVisible(true);
  }

  async function updateIdFromButton(newId: string) {
    let result = await updateId(newId);
    switch (result) {
      case 'SUCCESS_STORING_SUCCESS_CREATING':
        MakePopup('✅ Id successfully updated');
        break;

      case 'SUCCESS_STORING_FAIL_CREATING':
        MakePopup(
          "🛜 Couldn't create Id on the Openpath server, but it will be done before the next upload",
        );
        break;

      case 'SAME_ID_OR_INVALID_ID':
        MakePopup('❌ Same Id or invalid Id');
        break;

      default:
        MakePopup('❌ Unexpected error updating the user Id');
        break;
    }
  }

  return (
    <SafeAreaView style={backgroundStyle}>
      <View
        style={{
          backgroundColor: isDarkMode ? Colors.black : Colors.white,
          paddingVertical: 200,
          justifyContent: 'center',
          alignContent: 'center',
        }}>
        <View>
          <GeolocationSwitch />

          <Button
            onPress={async function () {
              let idToCopy = await getOrCreateId();
              if (idToCopy == undefined) {
                idToCopy = 'undefinedId';
              }
              Clipboard.setString(idToCopy);
            }}
            title="Copy secret Tracker Id (for konnector)"
          />
          <View>
            <Button
              onPress={async () => {
                console.log('Copying logs...');
                Clipboard.setString((await getAllLogs()) || '');
                MakePopup('Copied');
              }}
              title="Copy logs in clipboard"
              disabled={false}
            />
            <Button
              onPress={async () => {
                console.log('Send logs');
                sendLogFile()
                  .then(() => {
                    MakePopup('Extraction successful');
                  })
                  .catch(error => {
                    MakePopup('Error: ' + error.toString());
                  });
              }}
              title="Send logs"
              disabled={false}
            />
          </View>
          <Button
            onPress={() => {
              ForceUploadMobility();
            }}
            title="Force upload pending tracks to E-Mission"
            disabled={!devMode}
          />

          <Button
            onPress={async function () {
              DisplayIdInputPopup();
            }}
            title="Manually redefine secret Tracker Id"
            disabled={!devMode}
          />
        </View>
        <Button
          onPress={async function () {
            try {
              await clearAllCozyGPSMemoryData();
              MakePopup('Deleted everything');
            } catch (error) {
              MakePopup("Couldn't purge\n" + error);
            }
          }}
          title="Purge all local data"
          color={'#ff3b30'}
          disabled={!devMode}
        />

        <PopUp />

        <Modal
          visible={idInputPopupVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={closeIdInputPopup}
          style={{alignContent: 'center', justifyContent: 'center'}}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={{fontSize: 24, textAlign: 'center'}}>New Id</Text>
              <TextInput
                autoFocus={true}
                value={IdBoxText}
                onChangeText={setIdBoxTest}
                selectTextOnFocus={true}
                keyboardType="email-address"
                style={{
                  padding: 20,
                  alignContent: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: 18,
                }}
              />
              <Button
                title="Cancel (keep existing Id)"
                onPress={async function () {
                  closeIdInputPopup();
                }}
              />
              <Button
                title="Validate"
                onPress={async function () {
                  closeIdInputPopup();
                  updateIdFromButton(IdBoxText);
                }}
              />
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    alignContent: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignContent: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 8,
    alignContent: 'center',
    justifyContent: 'center',
  },
  modalText: {
    fontSize: 18,
    marginBottom: 10,
    textAlign: 'center',
    alignContent: 'center',
    justifyContent: 'center',
  },
});

export default App;
