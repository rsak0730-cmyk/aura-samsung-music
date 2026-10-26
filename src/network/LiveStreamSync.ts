export class AuraLiveStreamSync {
  private peerConnection!: RTCPeerConnection;
  private dataChannel?: RTCDataChannel;
  private remoteAudioElement: HTMLAudioElement;

  constructor() {
    this.remoteAudioElement = new Audio();
    this.remoteAudioElement.autoplay = true;
  }

  public async startBroadcast(audioStream: MediaStream): Promise<string> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    audioStream.getAudioTracks().forEach((track) => {
      this.peerConnection.addTrack(track, audioStream);
    });

    this.dataChannel = this.peerConnection.createDataChannel('sync-control', { ordered: true });

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    return new Promise((resolve) => {
      this.peerConnection.onicecandidate = (e) => {
        if (!e.candidate) {
          resolve(btoa(JSON.stringify(this.peerConnection.localDescription)));
        }
      };
    });
  }

  public async receiveBroadcast(hostOfferToken: string): Promise<string> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteAudioElement.srcObject = event.streams[0];
        this.remoteAudioElement.play().catch((err) => {
          console.warn('Audio autoplay blocked, tap screen:', err);
        });
      }
    };

    const hostDesc = new RTCSessionDescription(JSON.parse(atob(hostOfferToken)));
    await this.peerConnection.setRemoteDescription(hostDesc);

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    return new Promise((resolve) => {
      this.peerConnection.onicecandidate = (e) => {
        if (!e.candidate) {
          resolve(btoa(JSON.stringify(this.peerConnection.localDescription)));
        }
      };
    });
  }

  public async completeConnection(answerToken: string) {
    const answerDesc = new RTCSessionDescription(JSON.parse(atob(answerToken)));
    await this.peerConnection.setRemoteDescription(answerDesc);
  }
}

export const liveStreamSync = new AuraLiveStreamSync();