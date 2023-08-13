/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  Button,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextBase,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';


import {
  Colors,
  DebugInstructions,
  Header,
  LearnMoreLinks,
  ReloadInstructions,
} from 'react-native/Libraries/NewAppScreen';

import BackgroundGeolocation, {
  State,
  Config,
  Location,
  LocationError,
  Geofence,
  GeofenceEvent,
  GeofencesChangeEvent,
  HeartbeatEvent,
  HttpEvent,
  MotionActivityEvent,
  MotionChangeEvent,
  ProviderChangeEvent,
  ConnectivityChangeEvent,
  Subscription
} from 'react-native-background-geolocation';

import { UploadData, _getId, ClearAllCozyGPSMemoryData, UpdateId, GeolocationSwitch } from './EMissionCompatibility.js'

const devMode = true;

function App(): JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  const [PopUpVisible, setPopUpVisible] = useState(false);
  const [idInputPopupVisible, setIdInputPopupVisible] = useState(false);
  const DisplayIdInputPopup = async () => {
    setIdBoxTest(await _getId() || '');
    setIdInputPopupVisible(true);
  }
  const ForceUploadMobility = async () => {
    await UploadData(true, false);
    BackgroundGeolocation.getLocations().then(async (locations) => {
      if (locations.length > 0) { // Méthode grossière, mais ça résout le problème
        MakePopup('❌ There are still local positions');
      } else {
        MakePopup('✅ All mobility measures uploaded!');
      }
    })
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
        animationType='fade'
        transparent={true}
        onRequestClose={closeModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalText}>{popUpText}</Text>
            <Button title='Close' onPress={closeModal} />
          </View>
        </View>
      </Modal>
    )
  }


  function MakePopup(text: string) {
    setPopUpText(text);
    setPopUpVisible(true);
  }

  async function UpdateIdFromButton(newId: string) {
    let result = await UpdateId(newId);
    switch (result) {

      case 'SUCCESS_STORING_SUCCESS_CREATING':
        MakePopup('✅ Id successfully updated');
        break;

      case 'SUCCESS_STORING_FAIL_CREATING':
        MakePopup('🛜 Couldn\'t create Id on the Openpath server, but it will be done before the next upload');
        break;

      case 'SAME_ID_OR_INVALID_ID':
        MakePopup('❌ Same Id or invalid Id');
        break;

      default:
        MakePopup('❌ Unexpected error updating the user Id')
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
          alignContent: 'center'
        }}>
        <View>

          <GeolocationSwitch></GeolocationSwitch>

          <Button
            onPress={() => { ForceUploadMobility(); }}
            title='Upload pending tracks to E-Mission'
            disabled={!devMode}
          />

          <Button
            onPress={async function () {
              let idToCopy = await _getId();
              if (idToCopy == undefined) {
                idToCopy = 'undefinedId';
              }
              Clipboard.setString(idToCopy);
            }}
            title='Copy secret Tracker Id (for konnector)'
          />

          <Button
            onPress={async function () {
              DisplayIdInputPopup();
            }}
            title='Manually redefine secret Tracker Id'
            disabled={!devMode}
          />

        </View>
        <Button
          onPress={async function () {
            try {
              await ClearAllCozyGPSMemoryData();
              MakePopup('Deleted everything');
            } catch (error) {
              MakePopup('Couldn\'t purge\n' + error)
            }
          }}
          title='Purge all local data'
          color={'#ff3b30'}
          disabled={!devMode}
        />

        <PopUp></PopUp>



        <Modal
          visible={idInputPopupVisible}
          animationType='fade'
          transparent={true}
          onRequestClose={closeIdInputPopup}
          style={{ alignContent: 'center', justifyContent: 'center' }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={{ fontSize: 24, textAlign: 'center' }}>New Id</Text>
              <TextInput
                autoFocus={true}
                value={IdBoxText}
                onChangeText={setIdBoxTest}
                selectTextOnFocus={true}
                keyboardType='email-address'
                style={{
                  padding: 20,
                  alignContent: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: 18,
                }}
              />
              <Button title='Cancel (keep existing Id)' onPress={async function () {
                closeIdInputPopup();
              }
              } />
              <Button title='Validate' onPress={async function () {
                closeIdInputPopup();
                UpdateIdFromButton(IdBoxText);
              }
              } />
            </View>
          </View>
        </Modal>

      </View >
    </SafeAreaView >
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
